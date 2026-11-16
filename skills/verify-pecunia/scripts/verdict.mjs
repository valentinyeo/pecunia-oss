#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_TABLE = join(SCRIPT_DIR, "step-table.json");
const DEFAULT_FEATURES = join(SCRIPT_DIR, "..", "features");
const PASS = "PASS";
const FAIL = "FAIL";

const asArray = (value) => (Array.isArray(value) ? value : []);

export const readTable = (path = DEFAULT_TABLE) =>
  JSON.parse(readFileSync(path, "utf8"));

export const readCapabilities = (directory = DEFAULT_FEATURES) => {
  const capabilities = new Map();

  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".md") || name === "README.md") {
      continue;
    }

    const lines = readFileSync(join(directory, name), "utf8").split("\n");
    const start = lines.indexOf("## Capabilities");

    if (start === -1) {
      continue;
    }

    const end = lines.findIndex(
      (line, index) => index > start && line.startsWith("## ")
    );
    const section = lines.slice(start + 1, end === -1 ? undefined : end);

    capabilities.set(
      name.replace(/\.md$/u, ""),
      section.flatMap((line) => {
        const match = /^- `([^`]+)`/u.exec(line);

        return match === null ? [] : [match[1]];
      })
    );
  }

  return capabilities;
};

const judgeCommands = ({ fail, record, step }) => {
  const declared = asArray(step.commands);
  const recorded = asArray(record.commands);

  for (const id of declared) {
    const runs = recorded.filter((command) => command.id === id);

    if (runs.length === 0) {
      fail(`step ${step.id} recorded no run of command ${id}`);
      continue;
    }

    if (runs.length > 1) {
      fail(`step ${step.id} recorded command ${id} ${runs.length} times`);
      continue;
    }

    if (runs[0].exit !== 0) {
      fail(`step ${step.id} command ${id} exited ${runs[0].exit}`);
    }
  }

  for (const command of recorded) {
    if (!declared.includes(command.id)) {
      fail(
        `step ${step.id} recorded command ${command.id}, which the step table does not declare`
      );
    }
  }
};

const judgeEntries = ({ declared, fail, kind, recorded, step }) => {
  const names = asArray(declared);
  const entries = asArray(recorded);

  for (const name of names) {
    const found = entries.filter((entry) => entry.name === name);

    if (found.length === 0) {
      fail(`step ${step} recorded no ${kind} ${name}`);
      continue;
    }

    if (found.length > 1) {
      fail(`step ${step} recorded ${kind} ${name} ${found.length} times`);
      continue;
    }

    if (found[0].found !== true) {
      fail(`step ${step} ${kind} ${name} was not written`);
    }
  }

  for (const entry of entries) {
    if (!names.includes(entry.name)) {
      fail(
        `step ${step} recorded ${kind} ${entry.name}, which the step table does not declare`
      );
    }
  }
};

const judgeChecks = ({ checks, fail }) => {
  const ids = new Set();

  for (const check of checks) {
    if (ids.has(check.id)) {
      fail(`check ${check.id} is recorded more than once`);
    }

    ids.add(check.id);

    if (check.expected !== check.actual) {
      fail(
        `check ${check.id} expected ${check.expected} and observed ${check.actual}`
      );
    }
  }
};

const judgeCoverage = ({
  capabilities,
  fail,
  feature,
  listed,
  planned,
  table,
}) => {
  const pages = feature === "all" ? [...capabilities.keys()] : [feature];

  for (const page of pages) {
    for (const name of capabilities.get(page) ?? []) {
      const mapped = asArray(table.steps)
        .filter((step) => asArray(step.capabilities).includes(name))
        .map((step) => step.id);

      if (mapped.length === 0) {
        fail(`capability ${name} has no drive step in the step table`);
        continue;
      }

      const driven = mapped.some(
        (id) =>
          planned.includes(id) && listed.some((record) => record.step === id)
      );

      if (!driven) {
        fail(`capability ${name} has no drive step that ran`);
      }
    }
  }
};

export const judge = ({
  capabilities,
  feature,
  records,
  recordsError,
  recordsPath,
  table,
}) => {
  const failures = [];
  const fail = (message) => {
    failures.push(message);
  };
  const stepIds = table.features?.[feature];
  const planned = stepIds ?? [];
  const listed = records ?? [];
  const steps = new Map(asArray(table.steps).map((step) => [step.id, step]));
  const seen = new Set();
  const checks = [];

  if (recordsError === undefined) {
    if (records === undefined) {
      fail(`record file ${recordsPath} is missing`);
    } else if (listed.length === 0) {
      fail(`record file ${recordsPath} is empty`);
    }
  } else {
    fail(recordsError);
  }

  if (stepIds === undefined) {
    fail(`feature ${feature} has no declared step table`);
  }

  for (const record of listed) {
    const step = steps.get(record.step);

    if (step === undefined || !planned.includes(record.step)) {
      fail(
        `record for step ${record.step}, which the ${feature} step table does not declare`
      );
      continue;
    }

    if (seen.has(record.step)) {
      fail(`step ${record.step} has more than one record`);
      continue;
    }

    seen.add(record.step);

    if (record.exit !== 0) {
      fail(`step ${record.step} exited ${record.exit}`);
    }

    judgeCommands({ fail, record, step });
    judgeEntries({
      declared: step.outputs,
      fail,
      kind: "output",
      recorded: record.outputs,
      step: step.id,
    });
    judgeEntries({
      declared: step.artifacts,
      fail,
      kind: "artifact",
      recorded: record.artifacts,
      step: step.id,
    });

    for (const check of asArray(record.checks)) {
      checks.push({ ...check, feature, step: step.id });
    }
  }

  if (listed.length > 0) {
    for (const id of planned) {
      if (!seen.has(id)) {
        fail(`step ${id} has no record`);
      }
    }
  }

  judgeChecks({ checks, fail });
  judgeCoverage({ capabilities, fail, feature, listed, planned, table });

  return {
    checks,
    failures,
    passed: failures.length === 0,
    steps: planned,
  };
};

const copyArtifacts = (records, evidenceDirectory) => {
  const failures = [];

  for (const record of asArray(records)) {
    for (const artifact of asArray(record.artifacts)) {
      if (artifact.found !== true) {
        continue;
      }

      try {
        copyFileSync(artifact.path, join(evidenceDirectory, artifact.name));
      } catch {
        failures.push(
          `artifact ${artifact.name} could not be copied from ${artifact.path}`
        );
      }
    }
  }

  return failures;
};

const mergedData = (records) => {
  const data = {};

  for (const record of asArray(records)) {
    for (const [key, value] of Object.entries(record.data ?? {})) {
      data[key] = value;
    }
  }

  return data;
};

const proofMarkdown = ({
  data,
  failures,
  feature,
  label,
  passed,
  ranAt,
  records,
  result,
}) => {
  const failedChecks = result.checks.filter(
    (check) => check.expected !== check.actual
  ).length;
  const lines = [];
  const commands = [];

  if ((data.buildCommand ?? "").length > 0) {
    commands.push(data.buildCommand);
  }

  if ((data.buildLinesCommand ?? "").length > 0) {
    commands.push(data.buildLinesCommand);
  }

  if ((data.seedCommand ?? "").length > 0) {
    commands.push(data.seedCommand);
  }

  commands.push(
    `bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature ${feature} --label ${label}`
  );
  commands.push(
    `node skills/verify-pecunia/scripts/replay-proof.mjs --only ${label}`
  );

  lines.push(`# Verification proof: ${label}`, "");
  lines.push(`- Run label: \`${label}\``);
  lines.push(`- Run at: ${ranAt}`);
  lines.push(
    `- Branch: \`${data.branch ?? "unknown"}\` at \`${data.commit ?? "unknown"}\``
  );
  lines.push(`- Node: \`${data.node ?? "unknown"}\``);
  lines.push(`- Demo seed: \`${data.seedCommand ?? "unknown"}\``);
  lines.push(`- Demo book SHA-256: \`${data.demoBookSha256 ?? "unknown"}\``);
  lines.push(
    "- The scratch database is deleted after the run; `proof.json` holds every observation.",
    ""
  );
  lines.push("## Commands", "", "```sh", ...commands, "```", "");
  lines.push(
    "## Steps",
    "",
    "| Step | Exit | Commands | Checks |",
    "| --- | --- | --- | --- |"
  );

  for (const id of result.steps) {
    const record = asArray(records).find((entry) => entry.step === id);
    const exit = record === undefined ? "no record" : `${record.exit}`;
    const commandList =
      record === undefined
        ? ""
        : asArray(record.commands)
            .map((command) => `\`${command.id}\` ${command.exit}`)
            .join(", ");
    const checkCount = result.checks.filter(
      (check) => check.step === id
    ).length;

    lines.push(`| \`${id}\` | ${exit} | ${commandList} | ${checkCount} |`);
  }

  lines.push(
    "",
    "## Seeded tables",
    "",
    "```text",
    data.seedRows ?? "",
    "```",
    "",
    "## Checks",
    "",
    "| Check | Result | Expected | Observed |",
    "| --- | --- | --- | --- |"
  );

  for (const check of result.checks) {
    const outcome = check.expected === check.actual ? "passed" : "failed";

    lines.push(
      `| \`${check.id}\` ${check.title} | ${outcome} | \`${check.expected}\` | \`${check.actual}\` |`
    );
  }

  const artifacts = asArray(records).flatMap((record) =>
    asArray(record.artifacts).map(
      (artifact) => `- \`${artifact.name}\` from the \`${record.step}\` step`
    )
  );

  if (artifacts.length > 0) {
    lines.push("", "## Capability drives", "", ...artifacts);
  }

  lines.push("", "## Verdict", "");

  if (passed) {
    lines.push(
      `${PASS}: ${result.steps.length} steps ran, ${result.checks.length} checks held against the seeded demo book.`
    );
  } else {
    lines.push(
      `${FAIL}: ${failures.length} problems, ${failedChecks} of ${result.checks.length} checks failed.`,
      ""
    );

    for (const failure of failures) {
      lines.push(`- ${failure}`);
    }
  }

  lines.push("", "## What this proves", "");

  if (passed) {
    lines.push(
      "- The migrations and the demo seed fill a real SQLite database with the demo book.",
      "- Every money value read back is an integer of minor units with an ISO currency code.",
      "- Every check named above held for the demo data against its stated expected value."
    );

    for (const line of artifacts) {
      lines.push(`- ${line.replace(/^- /u, "")} ran.`);
    }
  } else {
    lines.push("Nothing: the verdict is FAIL, so this run proves no claim.");
  }

  lines.push(
    "",
    "## What this does not prove",
    "",
    "- The capability drives run on the package memory ledger and the demo seed; a persistent store and the RPC, MCP, and CLI projections are not exercised.",
    "- No finance screen is reached, so the demo-book checks read the seeded data at the data layer.",
    ""
  );

  return lines.join("\n");
};

const writeEvidence = ({
  data,
  evidence,
  failures,
  feature,
  label,
  passed,
  ranAt,
  records,
  result,
}) => {
  mkdirSync(evidence, { recursive: true });

  const checks = result.checks.map((check) => ({
    actual: check.actual,
    expected: check.expected,
    feature: check.feature,
    id: check.id,
    passed: check.expected === check.actual,
    step: check.step,
    title: check.title,
  }));
  const failedChecks = checks.filter((check) => !check.passed).length;
  const failedSteps = asArray(records).filter(
    (record) => record.exit !== 0
  ).length;
  const proof = {
    branch: data.branch ?? "unknown",
    checks,
    commit: data.commit ?? "unknown",
    demoBookSha256: data.demoBookSha256 ?? "unknown",
    failed: failedChecks,
    failedSteps,
    failures,
    feature,
    node: data.node ?? "unknown",
    passed,
    ranAt,
    seed: { command: data.seedCommand ?? "unknown" },
    steps: result.steps.length,
    total: checks.length,
  };

  writeFileSync(
    join(evidence, "PROOF.md"),
    proofMarkdown({
      data,
      failures,
      feature,
      label,
      passed,
      ranAt,
      records,
      result,
    })
  );
  writeFileSync(
    join(evidence, "proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`
  );
};

const parseArguments = (argv) => {
  const parsed = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument ${token}`);
    }

    parsed.set(token.slice(2), argv[index + 1] ?? "");
    index += 1;
  }

  return parsed;
};

const required = (arguments_, name) => {
  const value = arguments_.get(name);

  if (value === undefined || value === "") {
    throw new Error(`--${name} is required`);
  }

  return value;
};

const readRecords = (path) => {
  if (!existsSync(path)) {
    return { records: undefined };
  }

  try {
    const records = readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));

    return { records };
  } catch (error) {
    return {
      recordsError: `record file ${path} does not hold JSON lines: ${error.message}`,
    };
  }
};

const runCheck = (arguments_) => {
  const feature = required(arguments_, "feature");
  const label = required(arguments_, "label");
  const recordsPath = required(arguments_, "records");
  const evidence = required(arguments_, "evidence");
  const tablePath = arguments_.get("table") ?? DEFAULT_TABLE;
  const featuresDirectory = arguments_.get("features") ?? DEFAULT_FEATURES;
  const ranAt = arguments_.get("ran-at") ?? new Date().toISOString();
  const table = readTable(tablePath);
  const { records, recordsError } = readRecords(recordsPath);
  const result = judge({
    capabilities: readCapabilities(featuresDirectory),
    feature,
    records,
    recordsError,
    recordsPath,
    table,
  });

  mkdirSync(evidence, { recursive: true });
  result.failures.push(...copyArtifacts(records, evidence));
  const passed = result.failures.length === 0;
  const data = mergedData(records);

  writeEvidence({
    data,
    evidence,
    failures: result.failures,
    feature,
    label,
    passed,
    ranAt,
    records,
    result,
  });

  for (const failure of result.failures) {
    process.stderr.write(`${FAIL} ${failure}\n`);
  }

  const failedChecks = result.checks.filter(
    (check) => check.expected !== check.actual
  ).length;

  process.stdout.write(`Proof: ${join(evidence, "PROOF.md")}\n`);

  if (passed) {
    process.stdout.write(
      `${PASS} ${result.steps.length} steps, ${result.checks.length} checks, 0 failed.\n`
    );
  } else {
    process.stdout.write(
      `${FAIL} ${result.failures.length} problems, ${failedChecks} of ${result.checks.length} checks failed.\n`
    );
  }

  process.exit(passed ? 0 : 1);
};

const main = () => {
  const [command, ...rest] = process.argv.slice(2);
  const arguments_ = parseArguments(rest);
  const table = readTable();

  if (command === "features") {
    process.stdout.write(`${Object.keys(table.features).join("\n")}\n`);
    return;
  }

  if (command === "plan" || command === "list") {
    const feature = required(arguments_, "feature");
    const steps = table.features[feature];

    if (steps === undefined) {
      throw new Error(`feature ${feature} has no declared step table`);
    }

    if (command === "plan") {
      process.stdout.write(`${steps.join("\n")}\n`);
      return;
    }

    const byId = new Map(table.steps.map((step) => [step.id, step]));

    for (const id of steps) {
      const step = byId.get(id);

      process.stdout.write(
        `${id}\t${asArray(step?.commands).join(",")}\t${asArray(step?.outputs).join(",")}\n`
      );
    }

    return;
  }

  if (command === "check") {
    runCheck(arguments_);
    return;
  }

  throw new Error(`unknown command ${command ?? ""}`);
};

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${FAIL} ${error.message}\n`);
    process.exit(2);
  }
}
