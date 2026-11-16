import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  evaluate,
  judge,
  readCapabilities,
  readPageExpectations,
} from "./verdict.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..", "..");
const SCRIPT_PATH = join(SCRIPT_DIR, "prove-demo-book.sh");
const TABLE_PATH = join(SCRIPT_DIR, "step-table.json");
const FEATURES_DIR = join(SCRIPT_DIR, "..", "features");
const MAP_PATH = join(SCRIPT_DIR, "check-feature-map.mjs");
const RECORDS_PATH = join(tmpdir(), "pecunia-check-records.jsonl");
const FEATURE = "all";
const table = JSON.parse(readFileSync(TABLE_PATH, "utf8"));
const capabilities = readCapabilities(FEATURES_DIR);
const pageExpectations = readPageExpectations(FEATURES_DIR);
const stepsById = new Map(table.steps.map((step) => [step.id, step]));
const demoNumbers = table.demoNumbers ?? {};

const makeRandom = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;

    return state / 4_294_967_296;
  };
};

const pick = (random, items) => items[Math.floor(random() * items.length)];

const satisfyingValue = (expectation) => {
  if (expectation.equals !== undefined) {
    return expectation.equals;
  }

  if (expectation.equalsDemoNumber !== undefined) {
    return demoNumbers[expectation.equalsDemoNumber];
  }

  if (expectation.contains !== undefined) {
    return `before ${expectation.contains} after`;
  }

  if (expectation.countEquals !== undefined) {
    return Array.from(
      { length: expectation.countEquals },
      (_, index) => `item-${index}`
    ).join(",");
  }

  return expectation.isTrue === true ? "true" : "false";
};

const passingRecords = (feature = FEATURE) =>
  table.features[feature].map((id) => {
    const step = stepsById.get(id);

    return {
      artifacts: step.artifacts.map((name) => ({
        found: true,
        name,
        path: join(tmpdir(), name),
      })),
      commands: step.commands.map((command) => ({ exit: 0, id: command })),
      data: {},
      exit: 0,
      feature,
      observations: step.expectations.map((expectation) => ({
        id: expectation.id,
        value: satisfyingValue(expectation),
      })),
      outputs: step.outputs.map((name) => ({ found: true, name })),
      step: id,
    };
  });

const judgeRecords = (
  records,
  caseTable = table,
  casePages = pageExpectations
) =>
  judge({
    capabilities,
    feature: FEATURE,
    pageExpectations: casePages,
    records,
    recordsPath: RECORDS_PATH,
    table: caseTable,
  });

const observedRecords = (records) =>
  records.filter((record) => record.observations.length > 0);

const mutated = (records) => structuredClone(records);

const mutate = (records, random) => {
  const kind = Math.floor(random() * 16);
  const withObservations = observedRecords(records);
  const record = pick(random, withObservations);
  const observation = pick(random, record.observations);

  if (kind === 0) {
    const next = mutated(records);

    next.find((entry) => entry.step === record.step).observations =
      record.observations.filter((entry) => entry.id !== observation.id);

    return {
      cause: observation.id,
      records: next,
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 1) {
    const next = mutated(records);

    next
      .find((entry) => entry.step === record.step)
      .observations.find((entry) => entry.id === observation.id).value =
      "mutated-observation";

    return {
      cause: observation.id,
      records: next,
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 2) {
    const next = mutated(records);

    next
      .find((entry) => entry.step === record.step)
      .observations.push({ id: "probe-unexpected", value: "value" });

    return {
      cause: "probe-unexpected",
      records: next,
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 3) {
    const next = mutated(records);

    next
      .find((entry) => entry.step === record.step)
      .observations.push(structuredClone(observation));

    return {
      cause: observation.id,
      records: next,
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 4) {
    const caseTable = structuredClone(table);
    const step = caseTable.steps.find((entry) => entry.id === record.step);

    step.expectations = step.expectations.filter(
      (expectation) => expectation.id !== observation.id
    );

    return {
      cause: observation.id,
      records: mutated(records),
      table: caseTable,
      pages: pageExpectations,
    };
  }

  if (kind === 5) {
    const casePages = structuredClone(pageExpectations);
    const id = observation.id;

    casePages.crossCutting = casePages.crossCutting.filter(
      (entry) => entry !== id
    );

    for (const [page, ids] of casePages.pages) {
      casePages.pages.set(
        page,
        ids.filter((entry) => entry !== id)
      );
    }

    return { cause: id, records: mutated(records), table, pages: casePages };
  }

  if (kind === 6) {
    const next = mutated(records);

    next.find((entry) => entry.step === record.step).observations = [];

    return {
      cause: observation.id,
      records: next,
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 7) {
    const index = records.indexOf(record);

    return {
      cause: record.step,
      records: records.filter((_, position) => position !== index),
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 8) {
    const next = mutated(records);

    next.push(structuredClone(records[records.indexOf(record)]));

    return {
      cause: record.step,
      records: next,
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 9) {
    const eligible = records.filter((entry) => entry.commands.length > 0);

    if (eligible.length === 0) {
      return mutate(records, random);
    }

    const target = pick(random, eligible);
    const command = pick(random, target.commands);
    const next = mutated(records);

    next
      .find((entry) => entry.step === target.step)
      .commands.find((entry) => entry.id === command.id).exit = 1;

    return {
      cause: command.id,
      records: next,
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 10) {
    const eligible = records.filter((entry) => entry.outputs.length > 0);

    if (eligible.length === 0) {
      return mutate(records, random);
    }

    const target = pick(random, eligible);
    const output = pick(random, target.outputs);
    const next = mutated(records);

    next
      .find((entry) => entry.step === target.step)
      .outputs.find((entry) => entry.name === output.name).found = false;

    return {
      cause: output.name,
      records: next,
      table,
      pages: pageExpectations,
    };
  }

  if (kind === 11) {
    const next = mutated(records);
    const ghost = "probe-ghost-step";

    next.push({
      artifacts: [],
      commands: [],
      data: {},
      exit: 0,
      feature: FEATURE,
      observations: [],
      outputs: [],
      step: ghost,
    });

    return { cause: ghost, records: next, table, pages: pageExpectations };
  }

  if (kind === 12) {
    return { cause: "empty", records: [], table, pages: pageExpectations };
  }

  if (kind === 13) {
    const name = pick(random, [...capabilities.values()].flat());
    const caseTable = structuredClone(table);

    for (const step of caseTable.steps) {
      step.capabilities = step.capabilities.filter((entry) => entry !== name);
    }

    return {
      cause: name,
      records: mutated(records),
      table: caseTable,
      pages: pageExpectations,
    };
  }

  if (kind === 14) {
    return {
      cause: "missing",
      records: undefined,
      table,
      pages: pageExpectations,
    };
  }

  const caseTable = structuredClone(table);
  const step = caseTable.steps.find((entry) => entry.id === record.step);
  const expectation = step.expectations.find(
    (entry) => entry.id === observation.id
  );

  for (const predicate of [
    "equals",
    "equalsDemoNumber",
    "contains",
    "countEquals",
    "isTrue",
    "isFalse",
  ]) {
    delete expectation[predicate];
  }

  return {
    cause: observation.id,
    records: mutated(records),
    table: caseTable,
    pages: pageExpectations,
  };
};

const injectStepFailure = (source, id) => {
  const header = `step_${id.replaceAll("-", "_")}() {`;

  assert.ok(source.includes(header), `${header} is missing`);

  return source.replace(header, `${header}\n  steps_observe injected failure`);
};

const runProof = (scriptPath, label) => {
  const root = mkdtempSync(join(tmpdir(), "pecunia-proof-"));
  const result = spawnSync(
    "bash",
    [
      scriptPath,
      "--feature",
      FEATURE,
      "--label",
      label,
      "--evidence-root",
      root,
    ],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );

  return {
    output: `${result.stdout}${result.stderr}`,
    root,
    status: result.status,
    stdout: result.stdout,
  };
};

const readSavedProof = (root) => {
  const name = readdirSync(root)[0];

  return readFileSync(join(root, name, "PROOF.md"), "utf8");
};

const writeFakeMapRoot = (withCapability) => {
  const root = mkdtempSync(join(tmpdir(), "pecunia-map-"));
  mkdirSync(join(root, "packages", "probe", "src"), { recursive: true });
  mkdirSync(join(root, "apps"), { recursive: true });
  mkdirSync(join(root, "skills", "verify-pecunia", "features"), {
    recursive: true,
  });
  const implement = withCapability
    ? "const probeCapability = implement(probeContract);\n"
    : "";
  writeFileSync(
    join(root, "packages", "probe", "src", "probe.ts"),
    `const probeContract = defineContract("probe.capability");\n${implement}`
  );
  writeFileSync(
    join(root, "skills", "verify-pecunia", "features", "README.md"),
    [
      "# Probe feature map",
      "",
      "## Not money capabilities",
      "",
      "| Module | Capabilities |",
      "| --- | --- |",
      "| `packages/probe/src/probe.ts` | `probe.capability` |",
      "",
    ].join("\n")
  );
  return root;
};

const runMap = (root) => {
  const result = spawnSync("node", [MAP_PATH, "--root", root], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const summary = /SUMMARY (?<fields>.*)/u.exec(result.stdout)?.groups?.fields;
  const fields = new Map(
    (summary ?? "").split(" ").map((field) => field.split("="))
  );
  return {
    failures: result.stderr
      .split("\n")
      .filter((line) => line.startsWith("FAIL ")),
    problems: Number(fields.get("problems")),
    status: result.status,
  };
};

test("every step function has one table entry and every entry has one function", () => {
  const source = readFileSync(SCRIPT_PATH, "utf8");
  const functions = new Set(
    [...source.matchAll(/^step_([a-z0-9_]+)\(\) \{/gmu)].map((match) =>
      match[1].replaceAll("_", "-")
    )
  );
  const declared = new Set();

  for (const feature of Object.keys(table.features)) {
    for (const id of table.features[feature]) {
      assert.ok(
        stepsById.has(id),
        `the ${feature} table runs ${id}, which has no step entry`
      );
      declared.add(id);
    }
  }

  const orphaned = [...functions].filter((name) => !declared.has(name));

  assert.deepEqual(
    orphaned,
    [],
    `step functions with no table entry: ${orphaned.join(", ")}`
  );
  assert.deepEqual(
    [...declared].filter((name) => !functions.has(name)),
    []
  );
});

test("each page expectation id is declared once and resolves to a value", () => {
  const ids = [
    ...pageExpectations.crossCutting,
    ...[...pageExpectations.pages.values()].flat(),
  ];
  const tableIds = table.steps.flatMap((step) =>
    step.expectations.map((expectation) => expectation.id)
  );

  assert.equal(new Set(pageExpectations.crossCutting).size, 5);
  assert.equal(new Set(ids).size, ids.length, "a page repeats an id");
  assert.deepEqual([...tableIds].sort(), [...ids].sort());

  for (const step of table.steps) {
    for (const expectation of step.expectations) {
      if (expectation.equalsDemoNumber !== undefined) {
        assert.ok(
          demoNumbers[expectation.equalsDemoNumber] !== undefined,
          `${expectation.id} names demo number ${expectation.equalsDemoNumber}, which the table does not declare`
        );
      }
    }
  }
});

test("the closed predicate set compares, counts and negates", () => {
  const caseOf = (expectation, value) =>
    evaluate({ demoNumbers, expectation, value }).ok;

  assert.equal(caseOf({ equals: "12" }, "12"), true);
  assert.equal(caseOf({ equals: "12" }, "12 "), false);
  assert.equal(caseOf({ equalsDemoNumber: "dashboardSpend" }, "328955"), true);
  assert.equal(caseOf({ equalsDemoNumber: "absent" }, "328955"), false);
  assert.equal(caseOf({ contains: "GB 4-6" }, "tax year GB 4-6"), true);
  assert.equal(caseOf({ contains: "GB 4-6" }, "tax year"), false);
  assert.equal(caseOf({ countEquals: 5 }, "a,b,c,d,e"), true);
  assert.equal(caseOf({ countEquals: 5 }, "a,b,c,d"), false);
  assert.equal(caseOf({ isTrue: true }, "true"), true);
  assert.equal(caseOf({ isFalse: true }, "false"), true);
  assert.equal(caseOf({ isFalse: true }, "true"), false);
  assert.notEqual(caseOf({}, "true"), true);
  assert.notEqual(caseOf({ equals: "a", isTrue: true }, "a"), true);
});

test("the unmutated helper passes", () => {
  const result = runProof(SCRIPT_PATH, "check-whole");
  const expected = new RegExp(
    `^PASS ${table.features[FEATURE].length} steps, \\d+ expectations, 0 failed\\.$`,
    "mu"
  );

  try {
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, expected);
  } finally {
    rmSync(result.root, { force: true, recursive: true });
  }
});

test("the verdict never passes a mutated record file and names the cause", () => {
  const seed = Number(process.env.CHECK_SEED ?? 20_261_116);
  const random = makeRandom(seed);
  const cases = 700;

  assert.equal(judgeRecords(passingRecords()).passed, true);

  for (let index = 0; index < cases; index += 1) {
    const {
      cause,
      records,
      table: caseTable,
      pages,
    } = mutate(passingRecords(), random);
    const result = judgeRecords(records, caseTable, pages);
    const text = result.failures.join("\n");
    const context = `seed ${seed} case ${index} cause ${cause}`;

    assert.equal(result.passed, false, `${context} passed with ${text}`);
    assert.ok(result.failures.length > 0, `${context} recorded no failure`);
    assert.ok(
      text.includes(cause),
      `${context} did not name the cause: ${text}`
    );
  }
});

test("a failing observation in every step fails the helper closed", () => {
  const source = readFileSync(SCRIPT_PATH, "utf8");
  const mutated = table.features[FEATURE].reduce(
    (text, id) => injectStepFailure(text, id),
    source
  );
  const path = join(SCRIPT_DIR, `.check-mutant-${process.pid}-every-step.sh`);
  const result = { root: undefined };

  try {
    writeFileSync(path, mutated, { mode: 0o755 });
    const run = runProof(path, "check-mutant");
    result.root = run.root;

    assert.notEqual(run.status, 0, run.output);
    assert.equal(run.output.includes("PASS"), false, run.output);

    for (const id of table.features[FEATURE]) {
      assert.ok(run.output.includes(id), `${id} is not named in ${run.output}`);
    }

    const proof = readSavedProof(run.root);

    assert.match(proof, /^FAIL: \d+ problems/mu);
    assert.equal(/^PASS:/mu.test(proof), false);
  } finally {
    rmSync(path, { force: true });
    if (result.root !== undefined) {
      rmSync(result.root, { force: true, recursive: true });
    }
  }
});

test("the repository feature map reports no problems", () => {
  const result = spawnSync("node", [MAP_PATH], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /problems=0/u);
});

test("the map check counts and fails every removed capability", () => {
  const complete = runMap(writeFakeMapRoot(true));

  assert.equal(complete.status, 0, complete.failures.join("\n"));
  assert.equal(complete.problems, 0);

  const removed = runMap(writeFakeMapRoot(false));

  assert.notEqual(removed.status, 0);
  assert.equal(removed.problems, 1);
  assert.equal(removed.failures.length, 1);
  assert.match(removed.failures[0], /probe\.capability/u);
});
