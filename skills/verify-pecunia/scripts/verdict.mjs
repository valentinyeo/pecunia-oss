#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalRecords, parseRecordSet } from "./lib/records.mjs";
import { isBoolean, isNumber, isText } from "./lib/values.mjs";

const SCRIPT_DIR = import.meta.dirname;

const DEFAULT_TABLE = path.join(SCRIPT_DIR, "step-table.json");

const DEFAULT_FEATURES = path.join(SCRIPT_DIR, "..", "features");

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

export const readTable = (tablePath = DEFAULT_TABLE) =>
  JSON.parse(readFileSync(tablePath, "utf-8"));

const readPageLines = (directory, name) =>
  readFileSync(path.join(directory, name), "utf-8").split("\n");

const bulletsAfter = (lines, start, pattern) => {
  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith("## ")
  );

  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .flatMap((line) => {
      const match = pattern.exec(line);

      return match === null ? [] : [match.groups.name];
    });
};

export const readCapabilities = (directory = DEFAULT_FEATURES) => {
  const capabilities = new Map();

  for (const name of readdirSync(directory).toSorted()) {
    if (name.endsWith(".md") === false || name === "README.md") {
      continue;
    }

    const lines = readPageLines(directory, name);
    const start = lines.indexOf("## Capabilities");

    if (start === -1) {
      continue;
    }

    capabilities.set(
      name.replace(/\.md$/u, ""),
      bulletsAfter(lines, start, /^- `(?<name>[^`]+)`/u)
    );
  }

  return capabilities;
};

export const readPageExpectations = (directory = DEFAULT_FEATURES) => {
  const pages = new Map();

  for (const name of readdirSync(directory).toSorted()) {
    if (name.endsWith(".md") === false || name === "README.md") {
      continue;
    }

    const lines = readPageLines(directory, name);

    const start = lines.findIndex((line) =>
      line.startsWith("Checks this drive runs")
    );

    pages.set(
      name.replace(/\.md$/u, ""),
      start === -1
        ? []
        : bulletsAfter(lines, start, /^- `(?<name>[a-z0-9-]+)`: /u)
    );
  }

  const lines = readPageLines(directory, "README.md");
  const start = lines.indexOf("## Cross-cutting checks");

  return {
    crossCutting:
      start === -1
        ? []
        : bulletsAfter(lines, start, /^- `(?<name>[a-z0-9-]+)`$/u),
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
  ].toSorted();

  let difference;

  for (const field of fields) {
    const before = JSON.stringify(expected[field] ?? null);
    const after = JSON.stringify(actual?.[field] ?? null);

    if (before !== after) {
      difference = {
        actual: `record ${where} field ${field} ${after}`,
        expected: `record ${where} field ${field} ${before}`,
      };
      break;
    }
  }

  return difference;
};

const keyFieldOf = (rows) => {
  let keyField;

  for (const field of ["id", "fingerprint"]) {
    if (rows.every((row) => isText(row?.[field])) === true) {
      keyField = field;
      break;
    }
  }

  return keyField;
};

const recordDifference = (expected, actual) => {
  let difference;

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
      isText(row?.[keyField]) ? [row[keyField]] : []
    );

    const missing = expected
      .map((row) => row[keyField])
      .filter((key) => observed.includes(key) === false);

    const extra = observed.filter(
      (key) => expected.some((row) => row[keyField] === key) === false
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

    difference = fieldDifference(expectedRow, actualRow, where);

    if (difference !== undefined) {
      break;
    }
  }

  return difference;
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

  const [predicate] = declared;

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

  const { operation } = found;

  if (!isText(expectation.readOperation)) {
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
      `step ${step.id} readback expectation ${expectation.id} observed through operation ${isText(operation) && operation.length > 0 ? operation : "none"}, which is not the declared read operation ${expectation.readOperation}`
    );
  }
};

const judgeExpectations = ({
  demoNumbers,
  fail,
  readbackRecords,
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

    if (seen.has(expectation.id) === true) {
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

    const value = isText(found[0].value)
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

    if (result.ok === false && result.problem === undefined) {
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

const readbackExpectations = (step) =>
  asArray(step.expectations).filter(
    (expectation) => expectation.readback === true
  );

const judgeStepWrites = ({
  fail,
  id,
  mutatingCalls,
  ran,
  readbacks,
  step,
  writes,
}) => {
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

  if (step.writes !== true) {
    for (const expectation of readbacks) {
      fail(
        `step ${id} is not marked as writing but declares readback expectation ${expectation.id}`
      );
    }

    return;
  }

  if (writes.length === 0) {
    if (ran.has(id) === true) {
      fail(`step ${id} writes but declares no write operation`);
    }
  } else {
    for (const name of writes) {
      if (!isText(name) || name.length === 0) {
        fail(`step ${id} declares a write operation that is not a name`);
      }
    }
  }

  if (ran.has(id) === true && readbacks.length === 0) {
    fail(`step ${id} writes but declares no readback expectation`);
  }
};

const judgeRecordReadbacks = ({ fail, record, step }) => {
  for (const expectation of readbackExpectations(step)) {
    if (!isText(expectation.readOperation)) {
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
};

const judgeWriteReadbacks = ({ fail, planned, ran, records, steps }) => {
  for (const id of planned) {
    const step = steps.get(id);

    if (step === undefined) {
      continue;
    }

    if (step.writes !== undefined && !isBoolean(step.writes)) {
      fail(
        `step ${id} declares writes ${JSON.stringify(step.writes)}, which is not true or false`
      );
    }

    const recorded = asArray(records).find((entry) => entry.step === id);
    const mutatingCalls = recorded?.mutatingCalls ?? 0;

    if (!isNumber(mutatingCalls)) {
      fail(
        `step ${id} recorded mutating calls ${JSON.stringify(mutatingCalls)}, which is not a number`
      );
      continue;
    }

    judgeStepWrites({
      fail,
      id,
      mutatingCalls,
      ran,
      readbacks: readbackExpectations(step),
      step,
      writes: asArray(step.writeOperations),
    });
  }

  for (const record of asArray(records)) {
    const mutatingCalls = record.mutatingCalls ?? 0;
    const step = steps.get(record.step);

    if (step === undefined || !isNumber(mutatingCalls)) {
      continue;
    }

    judgeRecordReadbacks({ fail, record, step });
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
          planned.includes(step.id) === true &&
          asArray(step.capabilities).includes(name)
      );

      if (owners.length === 0) {
        fail(`${page} capability ${name} has no drive step in the step table`);
        continue;
      }

      const proven = owners
        .filter((step) => ran.has(step.id) === true)
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
    if (tableIds.has(id) === false) {
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

const judgeRecordFile = ({
  fail,
  listed,
  records,
  recordsError,
  recordsPath,
}) => {
  if (recordsError !== undefined) {
    fail(recordsError);

    return;
  }

  if (records === undefined) {
    fail(`record file ${recordsPath} is missing`);

    return;
  }

  if (listed.length === 0) {
    fail(`record file ${recordsPath} is empty`);
  }
};

const judgeRecord = ({
  demoNumbers,
  evaluated,
  expectations,
  fail,
  feature,
  planned,
  ran,
  readbackRecords,
  record,
  seen,
  steps,
}) => {
  const step = steps.get(record.step);

  if (step === undefined || planned.includes(record.step) === false) {
    fail(
      `record for step ${record.step}, which the ${feature} step table does not declare`
    );

    return 0;
  }

  if (seen.has(record.step) === true) {
    fail(`step ${record.step} has more than one record`);

    return 0;
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

  return judgeExpectations({
    demoNumbers,
    evaluated,
    expectations,
    fail,
    observed: asArray(record.observations),
    readbackRecords,
    seen,
    step,
  });
};

const judgeMissingRecords = ({ fail, listed, planned, seen }) => {
  if (listed.length === 0) {
    return;
  }

  for (const id of planned) {
    if (seen.has(id) === false) {
      fail(`step ${id} has no record`);
    }
  }
};

const featurePagesOf = ({ feature, pages }) => {
  if (feature === "all") {
    return [...pages.pages.keys()];
  }

  if (pages.pages.has(feature) === true) {
    return [feature];
  }

  return [];
};

const judgePageLists = ({ fail, featurePages, pages }) => {
  if (pages.crossCutting.length === 0) {
    fail("the feature map cross-cutting section lists no expectation ids");
  }

  for (const page of featurePages) {
    if ((pages.pages.get(page) ?? []).length === 0) {
      fail(`the ${page} page lists no expectation ids`);
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

  judgeRecordFile({ fail, listed, records, recordsError, recordsPath });

  if (stepIds === undefined) {
    fail(`feature ${feature} has no declared step table`);
  }

  for (const record of listed) {
    declared += judgeRecord({
      demoNumbers: table.demoNumbers ?? {},
      evaluated,
      expectations,
      fail,
      feature,
      planned,
      ran,
      readbackRecords: table.readbackRecords ?? {},
      record,
      seen,
      steps,
    });
  }

  judgeMissingRecords({ fail, listed, planned, seen });

  judgeCoverage({ capabilities, fail, feature, planned, ran, table });
  judgeWriteReadbacks({ fail, planned, ran, records: listed, steps });

  const pages = pageExpectations ?? { crossCutting: [], pages: new Map() };

  const featurePages = featurePagesOf({ feature, pages });

  judgePageLists({ fail, featurePages, pages });

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
        copyFileSync(
          artifact.path,
          path.join(evidenceDirectory, artifact.name)
        );
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

const proofCommands = ({ data, feature, label }) => {
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
    `bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature ${feature} --label ${label}`,
    `node skills/verify-pecunia/scripts/replay-proof.mjs --only ${label}`
  );

  return commands;
};

const stepTableLines = ({ records, result }) => {
  const rows = [];

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

    rows.push(`| \`${id}\` | ${exit} | ${commandList} | ${count} |`);
  }

  return rows;
};

const artifactLines = (records) =>
  asArray(records).flatMap((record) =>
    asArray(record.artifacts).map(
      (artifact) => `- \`${artifact.name}\` from the \`${record.step}\` step`
    )
  );

const verdictLines = ({ failedExpectations, failures, passed, result }) => {
  const lines = ["", "## Verdict", ""];

  if (passed === true) {
    lines.push(
      `${PASS}: ${result.steps.length} steps ran, ${result.evaluated} expectations held against the seeded demo book.`
    );

    return lines;
  }

  lines.push(
    `${FAIL}: ${failures.length} problems, ${failedExpectations} of ${result.expectations.length} expectations failed, ${result.evaluated} of ${result.declared} declared expectations evaluated.`,
    ""
  );

  for (const failure of failures) {
    lines.push(`- ${failure}`);
  }

  return lines;
};

const provesLines = ({ artifacts, passed }) => {
  const lines = ["", "## What this proves", ""];

  if (passed === true) {
    lines.push(
      "- The migrations and the demo seed fill a real SQLite database with the demo book.",
      "- Every money value read back is an integer of minor units with an ISO currency code.",
      "- Every expectation named above matched its observation for the demo data."
    );

    for (const line of artifacts) {
      lines.push(`- ${line.replace(/^- /u, "")} ran.`);
    }

    return lines;
  }

  lines.push("Nothing: the verdict is FAIL, so this run proves no claim.");

  return lines;
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
    (expectation) => expectation.passed === false
  ).length;

  const artifacts = artifactLines(records);

  const lines = [
    `# Verification proof: ${label}`,
    "",
    `- Run label: \`${label}\``,
    `- Run at: ${ranAt}`,
    `- Branch: \`${data.branch ?? "unknown"}\` at \`${data.commit ?? "unknown"}\``,
    `- Node: \`${data.node ?? "unknown"}\``,
    `- Demo seed: \`${data.seedCommand ?? "unknown"}\``,
    `- Demo book SHA-256: \`${data.demoBookSha256 ?? "unknown"}\``,
    "- The scratch database is deleted after the run; `proof.json` holds every observation.",
    "",
    "## Commands",
    "",
    "```sh",
    ...proofCommands({ data, feature, label }),
    "```",
    "",
    "## Steps",
    "",
    "| Step | Exit | Commands | Expectations |",
    "| --- | --- | --- | --- |",
    ...stepTableLines({ records, result }),
    "",
    `Total: ${result.expectations.length} expectations across ${result.steps.length} steps, ${result.declared} declared, ${result.evaluated} evaluated.`,
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
    "| --- | --- | --- | --- |",
  ];

  for (const expectation of result.expectations) {
    lines.push(
      `| \`${expectation.id}\` | ${expectation.passed === true ? "passed" : "failed"} | \`${expectation.expected}\` | \`${expectation.actual}\` |`
    );
  }

  if (artifacts.length > 0) {
    lines.push("", "## Capability drives", "", ...artifacts);
  }

  lines.push(
    ...verdictLines({ failedExpectations, failures, passed, result }),
    ...provesLines({ artifacts, passed }),
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

  const failed = checks.filter(
    (expectation) => expectation.passed === false
  ).length;

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
    path.join(evidence, "PROOF.md"),
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
    path.join(evidence, "proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`
  );
};

const parseArguments = (argv) => {
  const parsed = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token.startsWith("--") === false) {
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

const readRecords = (recordsPath) => {
  if (existsSync(recordsPath) === false) {
    return { records: undefined };
  }

  try {
    const records = readFileSync(recordsPath, "utf-8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line));

    return { records };
  } catch (error) {
    return {
      recordsError: `record file ${recordsPath} does not hold JSON lines: ${error.message}`,
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
    (expectation) => expectation.passed === false
  ).length;

  process.stdout.write(`Proof: ${path.join(evidence, "PROOF.md")}\n`);

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

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${FAIL} ${error.message}\n`);
    process.exit(2);
  }
}
