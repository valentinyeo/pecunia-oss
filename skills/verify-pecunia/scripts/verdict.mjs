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

import { canonicalRecords, parseRecordSet } from "./lib/records.mjs";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_TABLE = join(SCRIPT_DIR, "step-table.json");
const DEFAULT_FEATURES = join(SCRIPT_DIR, "..", "features");
const PASS = "PASS";
const FAIL = "FAIL";
const PREDICATES = [
  "equals",
  "equalsDemoNumber",
  "equalsRecords",
  "contains",
  "countEquals",
  "isTrue",
  "isFalse",
];

const asArray = (value) => (Array.isArray(value) ? value : []);

export const readTable = (path = DEFAULT_TABLE) =>
  JSON.parse(readFileSync(path, "utf8"));

const readPageLines = (directory, name) =>
  readFileSync(join(directory, name), "utf8").split("\n");

const bulletsAfter = (lines, start, pattern) => {
  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith("## ")
  );

  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .flatMap((line) => {
      const match = pattern.exec(line);

      return match === null ? [] : [match[1]];
    });
};

export const readCapabilities = (directory = DEFAULT_FEATURES) => {
  const capabilities = new Map();

  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".md") || name === "README.md") {
      continue;
    }

    const lines = readPageLines(directory, name);
    const start = lines.indexOf("## Capabilities");

    if (start === -1) {
      continue;
    }

    capabilities.set(
      name.replace(/\.md$/u, ""),
      bulletsAfter(lines, start, /^- `([^`]+)`/u)
    );
  }

  return capabilities;
};

export const readPageExpectations = (directory = DEFAULT_FEATURES) => {
  const pages = new Map();

  for (const name of readdirSync(directory).sort()) {
    if (!name.endsWith(".md") || name === "README.md") {
      continue;
    }

    const lines = readPageLines(directory, name);
    const start = lines.findIndex((line) =>
      line.startsWith("Checks this drive runs")
    );

    pages.set(
      name.replace(/\.md$/u, ""),
      start === -1 ? [] : bulletsAfter(lines, start, /^- `([a-z0-9-]+)`: /u)
    );
  }

  const lines = readPageLines(directory, "README.md");
  const start = lines.indexOf("## Cross-cutting checks");

  return {
    crossCutting:
      start === -1 ? [] : bulletsAfter(lines, start, /^- `([a-z0-9-]+)`$/u),
    pages,
  };
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

const fieldDifference = (expected, actual, where) => {
  const fields = [
    ...new Set([...Object.keys(expected), ...Object.keys(actual ?? {})]),
  ].sort();

  for (const field of fields) {
    const before = JSON.stringify(expected[field] ?? null);
    const after = JSON.stringify(actual?.[field] ?? null);

    if (before !== after) {
      return {
        actual: `record ${where} field ${field} ${after}`,
        expected: `record ${where} field ${field} ${before}`,
      };
    }
  }

  return undefined;
};

const keyFieldOf = (rows) => {
  if (rows.every((row) => typeof row?.id === "string")) {
    return "id";
  }

  if (rows.every((row) => typeof row?.fingerprint === "string")) {
    return "fingerprint";
  }

  return undefined;
};

const recordDifference = (expected, actual) => {
  if (expected.length !== actual.length) {
    return {
      actual: `${actual.length} records`,
      expected: `${expected.length} records`,
    };
  }

  const keyField = keyFieldOf(expected);
  const keyed = keyField !== undefined;

  if (keyed) {
    const observed = actual.flatMap((row) =>
      typeof row?.[keyField] === "string" ? [row[keyField]] : []
    );
    const missing = expected
      .map((row) => row[keyField])
      .filter((key) => !observed.includes(key));
    const extra = observed.filter(
      (key) => !expected.some((row) => row[keyField] === key)
    );

    if (missing.length > 0 || extra.length > 0) {
      return {
        actual: `record ${keyField} ${extra.join(",") === "" ? "missing" : extra.join(",")}`,
        expected: `record ${keyField} ${missing.join(",") === "" ? "unexpected" : missing.join(",")}`,
      };
    }
  }

  for (const [index, expectedRow] of expected.entries()) {
    const key = keyed ? expectedRow[keyField] : undefined;
    const actualRow = keyed
      ? actual.find((row) => row[keyField] === key)
      : actual[index];
    const where = key === undefined ? index + 1 : key;
    const difference = fieldDifference(expectedRow, actualRow, where);

    if (difference !== undefined) {
      return difference;
    }
  }

  return undefined;
};

export const evaluate = ({
  demoNumbers,
  expectation,
  readbackRecords,
  value,
}) => {
  const declared = PREDICATES.filter((key) => expectation[key] !== undefined);

  if (declared.length !== 1) {
    return {
      actual: value === undefined ? "not observed" : value,
      expected: `one of ${PREDICATES.join(", ")}`,
      ok: false,
      problem:
        declared.length === 0
          ? `expectation ${expectation.id} declares no predicate`
          : `expectation ${expectation.id} declares ${declared.length} predicates`,
    };
  }

  const predicate = declared[0];

  if (predicate === "equals") {
    return {
      actual: value,
      expected: expectation.equals,
      ok: value === expectation.equals,
    };
  }

  if (predicate === "equalsDemoNumber") {
    const expected = demoNumbers[expectation.equalsDemoNumber];

    return {
      actual: value,
      expected:
        expected === undefined
          ? `demo number ${expectation.equalsDemoNumber} (not declared)`
          : expected,
      ok: expected !== undefined && value === expected,
    };
  }

  if (predicate === "equalsRecords") {
    const expectedRows = (readbackRecords ?? {})[expectation.equalsRecords];

    if (expectedRows === undefined) {
      return {
        actual: value,
        expected: `readback records ${expectation.equalsRecords} (not declared)`,
        ok: false,
        problem: `expectation ${expectation.id} names readback records ${expectation.equalsRecords}, which the step table does not declare`,
      };
    }

    let observedRows;

    try {
      observedRows = parseRecordSet(value);
    } catch {
      return {
        actual: "not a record set",
        expected: `${expectedRows.length} records`,
        ok: false,
        problem: `expectation ${expectation.id} expects a record set and observed ${value}`,
      };
    }

    const difference = recordDifference(expectedRows, observedRows);

    if (difference !== undefined) {
      return { ...difference, ok: false };
    }

    return {
      actual: `${observedRows.length} records`,
      expected: `${expectedRows.length} records`,
      ok: canonicalRecords(observedRows) === canonicalRecords(expectedRows),
    };
  }

  if (predicate === "contains") {
    return {
      actual: value,
      expected: `contains ${expectation.contains}`,
      ok: value.includes(expectation.contains),
    };
  }

  if (predicate === "countEquals") {
    const counted = value
      .split(",")
      .filter((item) => item.trim().length > 0).length;

    return {
      actual: value,
      expected: `count ${expectation.countEquals}`,
      ok: counted === expectation.countEquals,
    };
  }

  return {
    actual: value,
    expected: predicate === "isTrue" ? "true" : "false",
    ok: value === (predicate === "isTrue" ? "true" : "false"),
  };
};

const judgeReadbackOperation = ({ fail, found, expectation, step }) => {
  if (expectation.readback !== true) {
    return;
  }

  const operation = found.operation;

  if (typeof expectation.readOperation !== "string") {
    return;
  }

  if (asArray(step.writeOperations).includes(operation)) {
    fail(
      `step ${step.id} readback expectation ${expectation.id} observed through the write operation ${operation}`
    );
    return;
  }

  if (operation !== expectation.readOperation) {
    fail(
      `step ${step.id} readback expectation ${expectation.id} observed through operation ${typeof operation === "string" && operation.length > 0 ? operation : "none"}, which is not the declared read operation ${expectation.readOperation}`
    );
  }
};

const judgeExpectations = ({
  demoNumbers,
  fail,
  readbackRecords,
  record,
  step,
  expectations,
  observed,
  evaluated,
  seen,
}) => {
  const declared = new Map();

  for (const expectation of asArray(step.expectations)) {
    if (declared.has(expectation.id)) {
      fail(`step ${step.id} declares expectation ${expectation.id} twice`);
      continue;
    }

    if (seen.has(expectation.id)) {
      fail(
        `step ${step.id} declares expectation ${expectation.id}, which another step already declares`
      );
      continue;
    }

    declared.set(expectation.id, expectation);
    seen.add(expectation.id);

    if (
      expectation.capability !== undefined &&
      !asArray(step.capabilities).includes(expectation.capability)
    ) {
      fail(
        `step ${step.id} expectation ${expectation.id} names capability ${expectation.capability}, which the step does not declare`
      );
    }
  }

  for (const [id, expectation] of declared) {
    const found = observed.filter((entry) => entry.id === id);

    if (found.length === 0) {
      fail(`step ${step.id} expectation ${id} was not observed`);
      expectations.push({
        actual: "not observed",
        expected: asArray(PREDICATES)
          .filter((key) => expectation[key] !== undefined)
          .map((key) => `${key} ${expectation[key]}`)
          .join(" "),
        id,
        passed: false,
        step: step.id,
      });
      continue;
    }

    if (found.length > 1) {
      fail(`step ${step.id} observed ${id} ${found.length} times`);
      expectations.push({
        actual: `${found.length} observations`,
        expected: "one observation",
        id,
        passed: false,
        step: step.id,
      });
      continue;
    }

    const value =
      typeof found[0].value === "string"
        ? found[0].value
        : JSON.stringify(found[0].value ?? null);
    judgeReadbackOperation({ fail, found: found[0], expectation, step });
    const result = evaluate({
      demoNumbers,
      expectation,
      readbackRecords,
      value,
    });

    evaluated.push(id);

    if (result.problem !== undefined) {
      fail(`step ${step.id} ${result.problem}`);
    }

    if (!result.ok && result.problem === undefined) {
      fail(
        `step ${step.id} expectation ${id} expected ${result.expected} and observed ${result.actual}`
      );
    }

    expectations.push({
      actual: result.actual ?? "not observed",
      expected: result.expected,
      id,
      passed: result.ok,
      step: step.id,
    });
  }

  for (const entry of observed) {
    if (!declared.has(entry.id)) {
      fail(
        `step ${step.id} observed ${entry.id}, which the step table does not expect`
      );
    }
  }

  return declared.size;
};

const judgeWriteReadbacks = ({ fail, planned, ran, records, steps }) => {
  for (const id of planned) {
    const step = steps.get(id);

    if (step === undefined) {
      continue;
    }

    if (step.writes !== undefined && typeof step.writes !== "boolean") {
      fail(
        `step ${id} declares writes ${JSON.stringify(step.writes)}, which is not true or false`
      );
    }

    const readbacks = asArray(step.expectations).filter(
      (expectation) => expectation.readback === true
    );
    const writes = asArray(step.writeOperations);
    const recorded = asArray(records).find((entry) => entry.step === id);
    const mutatingCalls = recorded?.mutatingCalls ?? 0;

    if (typeof mutatingCalls !== "number") {
      fail(
        `step ${id} recorded mutating calls ${JSON.stringify(mutatingCalls)}, which is not a number`
      );
      continue;
    }

    if (mutatingCalls > 0) {
      if (step.writes !== true) {
        fail(
          `step ${id} recorded ${mutatingCalls} mutating calls but is not marked as writing`
        );
      }

      if (writes.length === 0) {
        fail(
          `step ${id} recorded ${mutatingCalls} mutating calls but declares no write operation`
        );
      }

      if (readbacks.length === 0) {
        fail(
          `step ${id} recorded ${mutatingCalls} mutating calls but declares no readback expectation`
        );
      }
    }

    if (step.writes === true) {
      if (writes.length > 0) {
        for (const name of writes) {
          if (typeof name !== "string" || name.length === 0) {
            fail(`step ${id} declares a write operation that is not a name`);
          }
        }
      } else if (ran.has(id)) {
        fail(`step ${id} writes but declares no write operation`);
      }

      if (ran.has(id) && readbacks.length === 0) {
        fail(`step ${id} writes but declares no readback expectation`);
      }

      continue;
    }

    for (const expectation of readbacks) {
      fail(
        `step ${id} is not marked as writing but declares readback expectation ${expectation.id}`
      );
    }
  }

  for (const record of asArray(records)) {
    const mutatingCalls = record.mutatingCalls ?? 0;
    const step = steps.get(record.step);

    if (step === undefined || typeof mutatingCalls !== "number") {
      continue;
    }

    const readbacks = asArray(step.expectations).filter(
      (expectation) => expectation.readback === true
    );

    for (const expectation of readbacks) {
      if (typeof expectation.readOperation !== "string") {
        fail(
          `step ${record.step} readback expectation ${expectation.id} names no read operation`
        );
        continue;
      }

      if (asArray(step.writeOperations).includes(expectation.readOperation)) {
        fail(
          `step ${record.step} readback expectation ${expectation.id} reads back through the write operation ${expectation.readOperation}`
        );
      }
    }
  }
};

const judgeCoverage = ({
  capabilities,
  fail,
  feature,
  planned,
  ran,
  table,
}) => {
  const pages = feature === "all" ? [...capabilities.keys()] : [feature];

  for (const page of pages) {
    for (const name of capabilities.get(page) ?? []) {
      const owners = asArray(table.steps).filter(
        (step) =>
          planned.includes(step.id) && asArray(step.capabilities).includes(name)
      );

      if (owners.length === 0) {
        fail(`${page} capability ${name} has no drive step in the step table`);
        continue;
      }

      const proven = owners
        .filter((step) => ran.has(step.id))
        .flatMap((step) => asArray(step.expectations))
        .filter((expectation) => expectation.capability === name);

      if (proven.length === 0) {
        fail(`${page} capability ${name} has no declared expectation`);
      }
    }
  }
};

const judgePages = ({ expected, fail, feature, tableIds }) => {
  const allowed = new Set(expected);

  for (const id of expected) {
    if (!tableIds.has(id)) {
      fail(`feature page expectation ${id} has no entry in the step table`);
    }
  }

  for (const id of tableIds) {
    if (!allowed.has(id)) {
      fail(
        `step table expectation ${id} is on no feature page the ${feature} run covers`
      );
    }
  }
};

export const judge = ({
  capabilities,
  feature,
  pageExpectations,
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
  const expectations = [];
  const evaluated = [];
  const ran = new Set();
  let declared = 0;

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
    ran.add(step.id);

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
    declared += judgeExpectations({
      demoNumbers: table.demoNumbers ?? {},
      evaluated,
      expectations,
      fail,
      observed: asArray(record.observations),
      readbackRecords: table.readbackRecords ?? {},
      record,
      seen,
      step,
    });
  }

  if (listed.length > 0) {
    for (const id of planned) {
      if (!seen.has(id)) {
        fail(`step ${id} has no record`);
      }
    }
  }

  judgeCoverage({ capabilities, fail, feature, planned, ran, table });
  judgeWriteReadbacks({ fail, planned, ran, records: listed, steps });

  const pages = pageExpectations ?? { crossCutting: [], pages: new Map() };
  const featurePages =
    feature === "all"
      ? [...pages.pages.keys()]
      : pages.pages.has(feature)
        ? [feature]
        : [];

  if (pages.crossCutting.length === 0) {
    fail("the feature map cross-cutting section lists no expectation ids");
  }

  for (const page of featurePages) {
    if ((pages.pages.get(page) ?? []).length === 0) {
      fail(`the ${page} page lists no expectation ids`);
    }
  }

  const expected = [
    ...pages.crossCutting,
    ...featurePages.flatMap((page) => pages.pages.get(page) ?? []),
  ];
  const tableIds = new Set(
    planned.flatMap((id) =>
      asArray(steps.get(id)?.expectations).map((expectation) => expectation.id)
    )
  );

  judgePages({ expected, fail, feature, tableIds });

  if (evaluated.length !== declared) {
    fail(
      `${evaluated.length} of ${declared} declared expectations were evaluated`
    );
  }

  return {
    declared,
    evaluated: evaluated.length,
    expectations,
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
  const failedExpectations = result.expectations.filter(
    (expectation) => !expectation.passed
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
    "| Step | Exit | Commands | Expectations |",
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
    const count = result.expectations.filter(
      (expectation) => expectation.step === id
    ).length;

    lines.push(`| \`${id}\` | ${exit} | ${commandList} | ${count} |`);
  }

  lines.push(
    "",
    `Total: ${result.expectations.length} expectations across ${result.steps.length} steps, ${result.declared} declared, ${result.evaluated} evaluated.`
  );

  lines.push(
    "",
    "## Seeded tables",
    "",
    "```text",
    data.seedRows ?? "",
    "```",
    "",
    "## Expectations",
    "",
    "| Expectation | Result | Expected | Observed |",
    "| --- | --- | --- | --- |"
  );

  for (const expectation of result.expectations) {
    lines.push(
      `| \`${expectation.id}\` | ${expectation.passed ? "passed" : "failed"} | \`${expectation.expected}\` | \`${expectation.actual}\` |`
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
      `${PASS}: ${result.steps.length} steps ran, ${result.evaluated} expectations held against the seeded demo book.`
    );
  } else {
    lines.push(
      `${FAIL}: ${failures.length} problems, ${failedExpectations} of ${result.expectations.length} expectations failed, ${result.evaluated} of ${result.declared} declared expectations evaluated.`,
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
      "- Every expectation named above matched its observation for the demo data."
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
    "- No finance screen is reached, so the demo-book expectations read the seeded data at the data layer.",
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

  const checks = result.expectations.map((expectation) => ({
    actual: expectation.actual,
    expected: expectation.expected,
    feature,
    id: expectation.id,
    passed: expectation.passed,
    step: expectation.step,
  }));
  const failed = checks.filter((expectation) => !expectation.passed).length;
  const failedSteps = asArray(records).filter(
    (record) => record.exit !== 0
  ).length;
  const stepExpectations = {};

  for (const check of checks) {
    stepExpectations[check.step] = (stepExpectations[check.step] ?? 0) + 1;
  }

  const proof = {
    branch: data.branch ?? "unknown",
    checks,
    commit: data.commit ?? "unknown",
    declared: result.declared,
    demoBookSha256: data.demoBookSha256 ?? "unknown",
    evaluated: result.evaluated,
    failed,
    failedSteps,
    failures,
    feature,
    node: data.node ?? "unknown",
    passed,
    ranAt,
    seed: { command: data.seedCommand ?? "unknown" },
    stepExpectations,
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
    pageExpectations: readPageExpectations(featuresDirectory),
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

  const failedExpectations = result.expectations.filter(
    (expectation) => !expectation.passed
  ).length;

  process.stdout.write(`Proof: ${join(evidence, "PROOF.md")}\n`);

  if (passed) {
    process.stdout.write(
      `${PASS} ${result.steps.length} steps, ${result.evaluated} expectations, 0 failed.\n`
    );
  } else {
    process.stdout.write(
      `${FAIL} ${result.failures.length} problems, ${failedExpectations} of ${result.expectations.length} expectations failed, ${result.evaluated} of ${result.declared} declared expectations evaluated.\n`
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
