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
import nodePath from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

import { observe } from "./lib/observation.mjs";
import { canonicalRecords } from "./lib/records.mjs";
import { isNumber } from "./lib/values.mjs";
import {
  evaluate,
  judge,
  readCapabilities,
  readPageExpectations,
} from "./verdict.mjs";

const SCRIPT_DIR = import.meta.dirname;

const REPO_ROOT = nodePath.join(SCRIPT_DIR, "..", "..", "..");

const SCRIPT_PATH = nodePath.join(SCRIPT_DIR, "prove-demo-book.sh");

const TABLE_PATH = nodePath.join(SCRIPT_DIR, "step-table.json");

const FEATURES_DIR = nodePath.join(SCRIPT_DIR, "..", "features");

const MAP_PATH = nodePath.join(SCRIPT_DIR, "check-feature-map.mjs");

const RECORDS_PATH = nodePath.join(tmpdir(), "pecunia-check-records.jsonl");

const FEATURE = "all";

const table = JSON.parse(readFileSync(TABLE_PATH, "utf-8"));

const capabilities = readCapabilities(FEATURES_DIR);

const pageExpectations = readPageExpectations(FEATURES_DIR);

const stepsById = new Map(table.steps.map((step) => [step.id, step]));

const demoNumbers = table.demoNumbers ?? {};

const uint32 = (value) => {
  const remainder = Math.trunc(value) % 4_294_967_296;

  return remainder < 0 ? remainder + 4_294_967_296 : remainder;
};

const makeRandom = (seed) => {
  let state = uint32(seed);

  return () => {
    state = uint32(state * 1_664_525 + 1_013_904_223);

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

const passingValue = (expectation) => {
  if (expectation.equalsRecords !== undefined) {
    return canonicalRecords(table.readbackRecords[expectation.equalsRecords]);
  }

  return satisfyingValue(expectation);
};

const passingRecords = (feature = FEATURE) =>
  table.features[feature].map((id) => {
    const step = stepsById.get(id);

    return {
      artifacts: step.artifacts.map((name) => ({
        found: true,
        name,
        path: nodePath.join(tmpdir(), name),
      })),
      commands: step.commands.map((command) => ({ exit: 0, id: command })),
      data: {},
      exit: 0,
      feature,
      mutatingCalls: step.writes === true ? 1 : 0,
      observations: step.expectations.map((expectation) => ({
        id: expectation.id,
        operation: expectation.readOperation ?? "",
        value: passingValue(expectation),
      })),
      outputs: step.outputs.map((name) => ({ found: true, name })),
      step: id,
    };
  });

const caseOf = (expectation, value) =>
  evaluate({ demoNumbers, expectation, value }).ok;

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

const writtenSteps = (records) =>
  table.steps.filter(
    (step) =>
      step.writes === true && records.some((record) => record.step === step.id)
  );

const readbacksOf = (step) =>
  step.expectations.filter((expectation) => expectation.readback === true);

const readbackFields = {
  "accounts-and-bank-lines": [
    "amountMinor",
    "currency",
    "date",
    "description",
    "fingerprint",
    "reference",
  ],
  "bank-line-edit": [
    "id",
    "amount",
    "category",
    "note",
    "occurredAt",
    "status",
  ],
  "bank-line-review": [
    "id",
    "amount",
    "category",
    "note",
    "valueDate",
    "review",
  ],
};

const awaitingReview = () => Object.fromEntries([["_tag", "Awaiting"]]);

const corruptField = (row, field) => {
  const next = structuredClone(row);

  if (field === "amount") {
    next.amount = { ...next.amount, minor: next.amount.minor + 1 };
  } else if (field === "review") {
    next.review = awaitingReview();
  } else if (field === "category") {
    next.category = { value: "0192f0c1-00ff-7000-8000-000000000000" };
  } else if (isNumber(next[field])) {
    next[field] += 1;
  } else {
    next[field] = `${next[field]}-corrupt`;
  }

  return next;
};

const corruptRecords = (text, field) => {
  const rows = JSON.parse(text);

  return canonicalRecords([corruptField(rows[0], field), ...rows.slice(1)]);
};

const caseResult = (
  cause,
  records,
  caseTable = table,
  casePages = pageExpectations
) => ({
  cause,
  records,
  table: caseTable,
  pages: casePages,
});

const observationCase = (kind, records, record, observation) => {
  if (kind === 0) {
    const next = mutated(records);

    next.find((entry) => entry.step === record.step).observations =
      record.observations.filter((entry) => entry.id !== observation.id);

    return caseResult(observation.id, next);
  }

  if (kind === 1) {
    const next = mutated(records);

    next
      .find((entry) => entry.step === record.step)
      .observations.find((entry) => entry.id === observation.id).value =
      "mutated-observation";

    return caseResult(observation.id, next);
  }

  if (kind === 2) {
    const next = mutated(records);

    next
      .find((entry) => entry.step === record.step)
      .observations.push({ id: "probe-unexpected", value: "value" });

    return caseResult("probe-unexpected", next);
  }

  if (kind === 3) {
    const next = mutated(records);

    next
      .find((entry) => entry.step === record.step)
      .observations.push(structuredClone(observation));

    return caseResult(observation.id, next);
  }

  if (kind === 4) {
    const caseTable = structuredClone(table);
    const step = caseTable.steps.find((entry) => entry.id === record.step);

    step.expectations = step.expectations.filter(
      (expectation) => expectation.id !== observation.id
    );

    return caseResult(observation.id, mutated(records), caseTable);
  }

  if (kind === 5) {
    const casePages = structuredClone(pageExpectations);
    const { id } = observation;

    casePages.crossCutting = casePages.crossCutting.filter(
      (entry) => entry !== id
    );

    for (const [page, ids] of casePages.pages) {
      casePages.pages.set(
        page,
        ids.filter((entry) => entry !== id)
      );
    }

    return caseResult(id, mutated(records), table, casePages);
  }

  if (kind === 6) {
    const next = mutated(records);

    next.find((entry) => entry.step === record.step).observations = [];

    return caseResult(observation.id, next);
  }

  if (kind === 7) {
    const index = records.indexOf(record);

    return caseResult(
      record.step,
      records.filter((_, position) => position !== index)
    );
  }

  if (kind === 8) {
    const next = mutated(records);

    next.push(structuredClone(records[records.indexOf(record)]));

    return caseResult(record.step, next);
  }

  return assert.fail(`the mutation kind ${kind} has no case`);
};

const listedCase = (kind, records, random) => {
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

    return caseResult(command.id, next);
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

    return caseResult(output.name, next);
  }

  if (kind === 13) {
    const name = pick(random, [...capabilities.values()].flat());
    const caseTable = structuredClone(table);

    for (const step of caseTable.steps) {
      step.capabilities = step.capabilities.filter((entry) => entry !== name);
    }

    return caseResult(name, mutated(records), caseTable);
  }

  return assert.fail(`the mutation kind ${kind} has no case`);
};

const tableCase = (kind, records, random, record, observation) => {
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

    return caseResult(ghost, next);
  }

  if (kind === 12) {
    return caseResult("empty", []);
  }

  if (kind === 14) {
    return caseResult("missing");
  }

  if (kind === 15) {
    const caseTable = structuredClone(table);
    const step = caseTable.steps.find((entry) => entry.id === record.step);

    const expectation = step.expectations.find(
      (entry) => entry.id === observation.id
    );

    const predicates = new Set([
      "equals",
      "equalsDemoNumber",
      "equalsRecords",
      "contains",
      "countEquals",
      "isTrue",
      "isFalse",
    ]);

    const stripped = Object.fromEntries(
      Object.entries(expectation).filter(([key]) => !predicates.has(key))
    );

    step.expectations = step.expectations.map((entry) =>
      entry.id === expectation.id ? stripped : entry
    );

    return caseResult(observation.id, mutated(records), caseTable);
  }

  if (kind === 16) {
    const written = pick(random, writtenSteps(records));
    const caseTable = structuredClone(table);

    delete caseTable.steps.find((entry) => entry.id === written.id).writes;

    return caseResult(written.id, mutated(records), caseTable);
  }

  if (kind === 17) {
    const written = pick(random, writtenSteps(records));
    const caseTable = structuredClone(table);
    const step = caseTable.steps.find((entry) => entry.id === written.id);

    for (const expectation of step.expectations) {
      delete expectation.readback;
    }

    return caseResult(written.id, mutated(records), caseTable);
  }

  return assert.fail(`the mutation kind ${kind} has no case`);
};

const readbackCase = (kind, records, random) => {
  if (kind === 18) {
    const written = pick(random, writtenSteps(records));
    const readback = pick(random, readbacksOf(written));
    const next = mutated(records);
    const target = next.find((entry) => entry.step === written.id);

    target.observations = target.observations.filter(
      (entry) => entry.id !== readback.id
    );

    return caseResult(readback.id, next);
  }

  if (kind === 19) {
    const written = pick(random, writtenSteps(records));
    const readback = pick(random, readbacksOf(written));
    const next = mutated(records);

    next
      .find((entry) => entry.step === written.id)
      .observations.find((entry) => entry.id === readback.id).value =
      "mutated-readback";

    return caseResult(readback.id, next);
  }

  if (kind === 20) {
    const written = pick(random, writtenSteps(records));
    const readback = pick(random, readbacksOf(written));
    const field = pick(random, readbackFields[written.id]);
    const next = mutated(records);

    const matchedObservation = next
      .find((entry) => entry.step === written.id)
      .observations.find((entry) => entry.id === readback.id);

    matchedObservation.value = corruptRecords(matchedObservation.value, field);

    return caseResult(field, next);
  }

  if (kind === 21) {
    const written = pick(random, writtenSteps(records));
    const readback = pick(random, readbacksOf(written));
    const next = mutated(records);
    const target = next.find((entry) => entry.step === written.id);
    const readbackIds = new Set(readbacksOf(written).map((entry) => entry.id));

    const reply = target.observations.find(
      (entry) => !readbackIds.has(entry.id)
    );

    target.observations.find((entry) => entry.id === readback.id).value =
      reply.value;

    return caseResult(readback.id, next);
  }

  if (kind === 22) {
    const written = pick(random, writtenSteps(records));
    const readback = pick(random, readbacksOf(written));
    const next = mutated(records);
    const [operation] = written.writeOperations;

    next
      .find((entry) => entry.step === written.id)
      .observations.find((entry) => entry.id === readback.id).operation =
      operation;

    return caseResult(readback.id, next);
  }

  if (kind === 23) {
    const silent = records.filter(
      (entry) => stepsById.get(entry.step)?.writes !== true
    );

    const target = pick(random, silent);
    const next = mutated(records);

    next.find((entry) => entry.step === target.step).mutatingCalls = 1;

    return caseResult(target.step, next);
  }

  if (kind === 24) {
    const repeated = records.filter(
      (entry) => readbacksOf(stepsById.get(entry.step)).length > 1
    );

    const target = pick(random, repeated);
    const [first] = readbacksOf(stepsById.get(target.step));
    const next = mutated(records);

    next.find((entry) => entry.step === target.step).observations = next
      .find((entry) => entry.step === target.step)
      .observations.filter((entry) => entry.id !== first.id);

    return caseResult(first.id, next);
  }

  if (kind === 25) {
    const eligible = records.filter((entry) =>
      readbacksOf(stepsById.get(entry.step)).some(
        () => readbackFields[entry.step] !== undefined
      )
    );

    const target = pick(random, eligible);

    const readback = pick(
      random,
      readbacksOf(stepsById.get(target.step)).filter(
        () => readbackFields[target.step] !== undefined
      )
    );

    const next = mutated(records);

    const matchedObservation = next
      .find((entry) => entry.step === target.step)
      .observations.find((entry) => entry.id === readback.id);

    const rows = JSON.parse(matchedObservation.value);

    matchedObservation.value = canonicalRecords([
      ...rows,
      structuredClone(rows.at(-1)),
    ]);

    return caseResult(readback.id, next);
  }

  return assert.fail(`the mutation kind ${kind} has no case`);
};

const mutate = (records, random) => {
  const kind = Math.floor(random() * 26);
  const withObservations = observedRecords(records);
  const record = pick(random, withObservations);
  const observation = pick(random, record.observations);

  if (kind <= 8) {
    return observationCase(kind, records, record, observation);
  }

  if ((kind >= 9 && kind <= 10) || kind === 13) {
    return listedCase(kind, records, random);
  }

  if (kind <= 17) {
    return tableCase(kind, records, random, record, observation);
  }

  if (kind >= 18) {
    return readbackCase(kind, records, random);
  }

  return assert.fail(`the mutation kind ${kind} has no case`);
};

const injectStepFailure = (source, id) => {
  const header = `step_${id.replaceAll("-", "_")}() {`;

  assert.ok(source.includes(header), `${header} is missing`);

  return source.replace(header, `${header}\n  steps_observe injected failure`);
};

const runProof = (scriptPath, label) => {
  const root = mkdtempSync(nodePath.join(tmpdir(), "pecunia-proof-"));

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
    { cwd: REPO_ROOT, encoding: "utf-8" }
  );

  return {
    output: `${result.stdout}${result.stderr}`,
    root,
    status: result.status,
    stdout: result.stdout,
  };
};

const readSavedProof = (root) => {
  const [name] = readdirSync(root);

  return readFileSync(nodePath.join(root, name, "PROOF.md"), "utf-8");
};

const writeFakeMapRoot = (withCapability) => {
  const root = mkdtempSync(nodePath.join(tmpdir(), "pecunia-map-"));
  mkdirSync(nodePath.join(root, "packages", "probe", "src"), {
    recursive: true,
  });
  mkdirSync(nodePath.join(root, "apps"), { recursive: true });
  mkdirSync(nodePath.join(root, "skills", "verify-pecunia", "features"), {
    recursive: true,
  });

  const implement =
    withCapability === true
      ? "const probeCapability = implement(probeContract);\n"
      : "";

  writeFileSync(
    nodePath.join(root, "packages", "probe", "src", "probe.ts"),
    `const probeContract = defineContract("probe.capability");\n${implement}`
  );
  writeFileSync(
    nodePath.join(root, "skills", "verify-pecunia", "features", "README.md"),
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
    encoding: "utf-8",
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
  const source = readFileSync(SCRIPT_PATH, "utf-8");

  const functions = new Set(
    [...source.matchAll(/^step_(?<name>[a-z0-9_]+)\(\) \{/gmu)].map((match) =>
      match.groups.name.replaceAll("_", "-")
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
  assert.deepEqual(
    [...tableIds].toSorted((left, right) => left.localeCompare(right)),
    [...ids].toSorted((left, right) => left.localeCompare(right))
  );

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

test("the verdict fails a write step with no readback by name", () => {
  const unmarked = structuredClone(table);

  for (const step of unmarked.steps) {
    for (const expectation of step.expectations) {
      delete expectation.readback;
    }
  }

  const records = passingRecords();
  const written = writtenSteps(records);
  const result = judgeRecords(records, unmarked);
  const text = result.failures.join("\n");

  assert.ok(written.length > 0, "the step table marks no step as writing");
  assert.equal(result.passed, false);
  assert.match(text, /writes but declares no readback expectation/u);

  for (const step of written) {
    assert.ok(text.includes(step.id), `${step.id} is not named: ${text}`);
  }

  const misplaced = structuredClone(table);

  const reader = misplaced.steps.find(
    (step) => step.writes !== true && step.expectations.length > 0
  );

  reader.expectations[0].readback = true;

  const wrong = judgeRecords(records, misplaced);

  assert.equal(wrong.passed, false);
  assert.match(
    wrong.failures.join("\n"),
    /is not marked as writing but declares readback/u
  );
});

test("a discarding adapter fails through the stored-state readback", () => {
  const source = readFileSync(
    nodePath.join(SCRIPT_DIR, "drive-bank-lines.mjs"),
    "utf-8"
  );

  const write = [
    "      const edited = yield* editBankLine.handler(",
    "        editRequest({",
    "          category: CategoryChangeSchema.cases.Assigned.make({",
    "            categoryId: category,",
    "          }),",
    "          lineId: target.id,",
    "          note: NoteChangeSchema.cases.Set.make({ text: writtenNote }),",
    "        })",
    "      );",
  ].join("\n");

  const discard = [
    "      const edited = {",
    "        category: Option.some(category),",
    "        id: target.id,",
    "        note: writtenNote,",
    "        profileId: demoProfileId,",
    "      };",
  ].join("\n");

  const path = nodePath.join(
    SCRIPT_DIR,
    `.check-mutant-${process.pid}-edit.mjs`
  );

  assert.ok(source.includes(write), "the edit drive write call is missing");

  try {
    writeFileSync(path, source.replace(write, discard));

    const drive = spawnSync("node", [path, "--capability", "edit"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });

    assert.equal(drive.status, 0, drive.stderr);

    const { observations } = JSON.parse(drive.stdout);

    const records = passingRecords().map((record) =>
      record.step === "bank-line-edit" ? { ...record, observations } : record
    );

    const result = judgeRecords(records);
    const text = result.failures.join("\n");

    const reply = result.expectations.find(
      (expectation) =>
        expectation.id === "bank-line-edit-sets-category-and-note"
    );

    assert.equal(reply?.passed, true, text);
    assert.equal(result.passed, false, text);
    assert.match(text, /bank-line-edit-stores-category-and-note/u);
  } finally {
    rmSync(path, { force: true });
  }
});

test("a delayed-write adapter fails through the first-import readback", () => {
  const source = readFileSync(
    nodePath.join(SCRIPT_DIR, "drive-bank-import.mjs"),
    "utf-8"
  );

  const layer = [
    "const recorder = mutationRecorder();",
    "",
    "const layer = Layer.mergeAll(",
    "  countingLayer({",
    "    layer: memoryImportLedgerLayer(targets),",
  ].join("\n");

  const delayed = [
    "const recorder = mutationRecorder();",
    "const delayedLayer = Layer.effect(",
    "  ImportLedger,",
    "  Effect.gen(function* makeDelayedLedger() {",
    "    const inner = yield* ImportLedger;",
    "    let held;",
    "    let records = 0;",
    "",
    "    return {",
    "      ...inner,",
    "      record: (ledgerProfile, ledgerAccount, lines) =>",
    "        Effect.suspend(() => {",
    "          records += 1;",
    "",
    "          if (records === 1) {",
    "            held = { accountId: ledgerAccount, lines, profileId: ledgerProfile };",
    "",
    "            return Effect.succeed({",
    "              alreadyImported: 0,",
    "              imported: lines.length,",
    "            });",
    "          }",
    "",
    "          const first = held;",
    "",
    "          held = undefined;",
    "",
    "          return Effect.flatMap(",
    "            first === undefined",
    "              ? Effect.void",
    "              : inner.record(first.profileId, first.accountId, first.lines),",
    "            () => inner.record(ledgerProfile, ledgerAccount, lines)",
    "          );",
    "        }),",
    "    };",
    "  })",
    ").pipe(Layer.provide(memoryImportLedgerLayer(targets)));",
    "const layer = Layer.mergeAll(",
    "  countingLayer({",
    "    layer: delayedLayer,",
  ].join("\n");

  const path = nodePath.join(
    SCRIPT_DIR,
    `.check-mutant-${process.pid}-delayed-import.mjs`
  );

  const bookPath = nodePath.join(
    tmpdir(),
    `pecunia-check-delayed-${process.pid}.sqlite`
  );

  const book = new DatabaseSync(bookPath);

  assert.ok(source.includes(layer), "the import ledger layer is missing");

  book.exec(
    [
      "CREATE TABLE profiles (id TEXT PRIMARY KEY, base_currency TEXT NOT NULL)",
      "CREATE TABLE providers (id TEXT PRIMARY KEY, label TEXT NOT NULL)",
      "CREATE TABLE provider_accounts (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, provider_id TEXT NOT NULL, archived_at TEXT)",
      "INSERT INTO profiles VALUES ('profile-demo', 'EUR')",
      "INSERT INTO providers VALUES ('provider-wise', 'Wise')",
      "INSERT INTO provider_accounts VALUES ('account-demo', 'profile-demo', 'Demo Bank', 'bank', 'provider-wise', NULL)",
    ].join(";")
  );
  book.close();

  try {
    writeFileSync(path, source.replace(layer, delayed));

    const drive = spawnSync("node", [path, "--database", bookPath], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });

    assert.equal(drive.status, 0, drive.stderr);

    const { observations } = JSON.parse(drive.stdout);
    const driveIds = new Set(observations.map((entry) => entry.id));

    const records = passingRecords().map((record) =>
      record.step === "accounts-and-bank-lines"
        ? {
            ...record,
            observations: [
              ...record.observations.filter((entry) => !driveIds.has(entry.id)),
              ...observations,
            ],
          }
        : record
    );

    const result = judgeRecords(records);
    const text = result.failures.join("\n");

    const first = result.expectations.find(
      (expectation) => expectation.id === "import-stores-every-line"
    );

    const reply = result.expectations.find(
      (expectation) => expectation.id === "import-writes-every-line"
    );

    assert.equal(reply?.passed, true, text);
    assert.equal(result.passed, false, text);
    assert.equal(first?.passed, false, text);
    assert.match(text, /import-stores-every-line/u);
  } finally {
    rmSync(path, { force: true });
    rmSync(bookPath, { force: true });
  }
});

test("an observation holds a snapshot taken when it is emitted", () => {
  const rows = [{ id: "row-1", note: "before" }];
  const observation = observe({ id: "probe-snapshot", value: { rows } });

  rows.push({ id: "row-2", note: "late" });
  rows[0].note = "after";

  assert.deepEqual(observation.value, {
    rows: [{ id: "row-1", note: "before" }],
  });

  const text = observe({ id: "probe-text", value: "[]" });

  assert.deepEqual(text, { id: "probe-text", value: "[]" });
});

const demoBookPath = (label) => {
  const path = nodePath.join(
    tmpdir(),
    `pecunia-check-${label}-${process.pid}.sqlite`
  );

  const book = new DatabaseSync(path);

  book.exec(
    [
      "CREATE TABLE profiles (id TEXT PRIMARY KEY, base_currency TEXT NOT NULL)",
      "CREATE TABLE providers (id TEXT PRIMARY KEY, label TEXT NOT NULL)",
      "CREATE TABLE provider_accounts (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, provider_id TEXT NOT NULL, archived_at TEXT)",
      "INSERT INTO profiles VALUES ('profile-demo', 'EUR')",
      "INSERT INTO providers VALUES ('provider-wise', 'Wise')",
      "INSERT INTO provider_accounts VALUES ('account-demo', 'profile-demo', 'Demo Bank', 'bank', 'provider-wise', NULL)",
    ].join(";")
  );
  book.close();

  return path;
};

test("a shared readback array filled on replay fails the first-import readback", () => {
  const source = readFileSync(
    nodePath.join(SCRIPT_DIR, "drive-bank-import.mjs"),
    "utf-8"
  );

  const layer = [
    "const recorder = mutationRecorder();",
    "",
    "const layer = Layer.mergeAll(",
    "  countingLayer({",
    "    layer: memoryImportLedgerLayer(targets),",
  ].join("\n");

  const shared = [
    "const recorder = mutationRecorder();",
    "const heldLineSets = [];",
    "const sharedReadbackLayer = Layer.effect(",
    "  ImportLedger,",
    "  Effect.gen(function* makeSharedReadbackLedger() {",
    "    const inner = yield* ImportLedger;",
    "    let held;",
    "",
    "    return {",
    "      ...inner,",
    "      storedLines: (ledgerProfile, ledgerAccount) => {",
    "        if (held === undefined) {",
    "          held = heldLineSets;",
    "",
    "          return Effect.succeed(held);",
    "        }",
    "",
    "        return Effect.map(",
    "          inner.storedLines(ledgerProfile, ledgerAccount),",
    "          (lines) => {",
    "            held.length = 0;",
    "            held.push(...lines);",
    "",
    "            return held;",
    "          }",
    "        );",
    "      },",
    "    };",
    "  })",
    ").pipe(Layer.provide(memoryImportLedgerLayer(targets)));",
    "const layer = Layer.mergeAll(",
    "  countingLayer({",
    "    layer: sharedReadbackLayer,",
  ].join("\n");

  const path = nodePath.join(
    SCRIPT_DIR,
    `.check-mutant-${process.pid}-shared-import.mjs`
  );

  const bookPath = demoBookPath("shared-import");

  assert.ok(source.includes(layer), "the import ledger layer is missing");

  try {
    writeFileSync(path, source.replace(layer, shared));

    const drive = spawnSync("node", [path, "--database", bookPath], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });

    assert.equal(drive.status, 0, drive.stderr);

    const { observations } = JSON.parse(drive.stdout);

    const firstImport = observations.find(
      (entry) => entry.id === "import-stores-every-line"
    );

    assert.deepEqual(firstImport?.value, [], JSON.stringify(observations));

    const driveIds = new Set(observations.map((entry) => entry.id));

    const records = passingRecords().map((record) =>
      record.step === "accounts-and-bank-lines"
        ? {
            ...record,
            observations: [
              ...record.observations.filter((entry) => !driveIds.has(entry.id)),
              ...observations,
            ],
          }
        : record
    );

    const result = judgeRecords(records);
    const text = result.failures.join("\n");

    const readback = result.expectations.find(
      (expectation) => expectation.id === "import-stores-every-line"
    );

    const reply = result.expectations.find(
      (expectation) => expectation.id === "import-writes-every-line"
    );

    assert.equal(reply?.passed, true, text);
    assert.equal(readback?.passed, false, text);
    assert.equal(result.passed, false, text);
    assert.match(text, /import-stores-every-line/u);
  } finally {
    rmSync(path, { force: true });
    rmSync(bookPath, { force: true });
  }
});

const sharedReadbackStore = (source) => {
  const layer = [
    "const layerFor = (person) =>",
    "  Layer.mergeAll(",
    "    BankLineService.layer.pipe(",
    "      Layer.provide(",
    "        countingLayer({",
    "          layer: memoryBankLineStoreLayer({",
    "            categories: demoCategories,",
    "            lines: demoBankLines,",
    "          }),",
    '          mutations: ["patch"],',
  ].join("\n");

  const shared = [
    "const heldLines = [];",
    "const sharedReadbackServiceLayer = Layer.effect(",
    "  BankLineService,",
    "  Effect.gen(function* makeSharedReadbackService() {",
    "    const inner = yield* BankLineService;",
    "    let held;",
    "",
    "    return {",
    "      ...inner,",
    "      list: (scope, query) => {",
    "        if (held === undefined) {",
    "          held = heldLines;",
    "",
    "          return Effect.succeed({ lines: held, next: Option.none() });",
    "        }",
    "",
    "        return Effect.map(inner.list(scope, query), (page) => {",
    "          held.length = 0;",
    "          held.push(...page.lines);",
    "",
    "          return { ...page, lines: held };",
    "        });",
    "      },",
    "    };",
    "  })",
    ").pipe(",
    "  Layer.provide(",
    "    BankLineService.layer.pipe(",
    "      Layer.provide(",
    "        countingLayer({",
    "          layer: memoryBankLineStoreLayer({",
    "            categories: demoCategories,",
    "            lines: demoBankLines,",
    "          }),",
    '          mutations: ["patch"],',
    "          recorder,",
    "          service: BankLineStore,",
    "        })",
    "      )",
    "    )",
    "  )",
    ");",
    "",
    "const layerFor = (person) =>",
    "  Layer.mergeAll(sharedReadbackServiceLayer, Layer.succeed(CurrentPerson, person));",
    "",
    "const ignoredLayerFor = (person) =>",
    "  Layer.mergeAll(",
    "    BankLineService.layer.pipe(",
    "      Layer.provide(",
    "        countingLayer({",
    "          layer: memoryBankLineStoreLayer({",
    "            categories: demoCategories,",
    "            lines: demoBankLines,",
    "          }),",
    '          mutations: ["patch"],',
  ].join("\n");

  assert.ok(source.includes(layer), "the bank line store layer is missing");

  return source.replace(layer, shared);
};

const runSharedReadbackDrive = (label, capability) => {
  const source = readFileSync(
    nodePath.join(SCRIPT_DIR, "drive-bank-lines.mjs"),
    "utf-8"
  );

  const path = nodePath.join(
    SCRIPT_DIR,
    `.check-mutant-${process.pid}-${label}.mjs`
  );

  try {
    writeFileSync(path, sharedReadbackStore(source));

    const drive = spawnSync("node", [path, "--capability", capability], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });

    assert.equal(drive.status, 0, drive.stderr);

    return JSON.parse(drive.stdout).observations;
  } finally {
    rmSync(path, { force: true });
  }
};

test("a shared readback array filled after an edit fails the edit readback", () => {
  const observations = runSharedReadbackDrive("shared-edit", "edit");

  const readback = observations.find(
    (entry) => entry.id === "bank-line-edit-stores-category-and-note"
  );

  assert.deepEqual(readback?.value, [], JSON.stringify(observations));

  const driveIds = new Set(observations.map((entry) => entry.id));

  const records = passingRecords().map((record) =>
    record.step === "bank-line-edit"
      ? {
          ...record,
          observations: [
            ...record.observations.filter((entry) => !driveIds.has(entry.id)),
            ...observations,
          ],
        }
      : record
  );

  const result = judgeRecords(records);
  const text = result.failures.join("\n");

  const reply = result.expectations.find(
    (expectation) => expectation.id === "bank-line-edit-sets-category-and-note"
  );

  assert.equal(reply?.passed, true, text);
  assert.equal(result.passed, false, text);
  assert.match(text, /bank-line-edit-stores-category-and-note/u);
});

test("a shared readback array filled after a review fails the review readback", () => {
  const observations = runSharedReadbackDrive("shared-review", "review");

  const readback = observations.find(
    (entry) => entry.id === "bank-line-review-shows-in-the-list"
  );

  assert.deepEqual(readback?.value, [], JSON.stringify(observations));

  const driveIds = new Set(observations.map((entry) => entry.id));

  const records = passingRecords().map((record) =>
    record.step === "bank-line-review"
      ? {
          ...record,
          observations: [
            ...record.observations.filter((entry) => !driveIds.has(entry.id)),
            ...observations,
          ],
        }
      : record
  );

  const result = judgeRecords(records);
  const text = result.failures.join("\n");

  const reply = result.expectations.find(
    (expectation) => expectation.id === "bank-line-review-marks-the-line"
  );

  assert.equal(reply?.passed, true, text);
  assert.equal(result.passed, false, text);
  assert.match(text, /bank-line-review-shows-in-the-list/u);
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
  const source = readFileSync(SCRIPT_PATH, "utf-8");

  let mutant = source;

  for (const id of table.features[FEATURE]) {
    mutant = injectStepFailure(mutant, id);
  }

  const path = nodePath.join(
    SCRIPT_DIR,
    `.check-mutant-${process.pid}-every-step.sh`
  );

  const result = { root: undefined };

  try {
    writeFileSync(path, mutant, { mode: 0o755 });
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
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /problems=0/u);
});

test("a readback that differs in one field of one row fails and names the field", () => {
  const fields = new Map([
    ["accounts-and-bank-lines", "import-stores-every-line"],
    ["bank-line-edit", "bank-line-edit-stores-category-and-note"],
    ["bank-line-review", "bank-line-review-shows-in-the-list"],
  ]);

  for (const [step, id] of fields) {
    for (const field of readbackFields[step]) {
      const records = passingRecords();

      const observation = records
        .find((record) => record.step === step)
        .observations.find((entry) => entry.id === id);

      observation.value = corruptRecords(observation.value, field);

      const result = judgeRecords(records);
      const text = result.failures.join("\n");

      const line = result.failures.find(
        (entry) =>
          entry.includes(id) === true && entry.includes("observed") === true
      );

      assert.equal(result.passed, false, `${step} ${field} passed: ${text}`);
      assert.ok(
        line !== undefined && line.includes(field),
        `${step} ${field} did not name the field: ${text}`
      );
    }
  }
});

test("the v60 reproduction fails: zero amounts and USD currencies in the ledger", () => {
  const records = passingRecords();

  const observation = records
    .find((record) => record.step === "accounts-and-bank-lines")
    .observations.find((entry) => entry.id === "import-stores-every-line");

  const rows = JSON.parse(observation.value).map((row) => ({
    ...row,
    amountMinor: 0,
    currency: "USD",
  }));

  observation.value = canonicalRecords(rows);

  const result = judgeRecords(records);
  const text = result.failures.join("\n");

  assert.equal(result.passed, false, text);
  assert.ok(text.includes("amountMinor"), text);

  const total = table.features[FEATURE].flatMap(
    (id) => stepsById.get(id).expectations
  ).length;

  assert.equal(result.expectations.length, total, text);
  assert.equal(
    result.expectations.filter((expectation) => expectation.passed === true)
      .length,
    total - 1,
    text
  );

  const currencyOnly = passingRecords();

  const stored = currencyOnly
    .find((record) => record.step === "accounts-and-bank-lines")
    .observations.find((entry) => entry.id === "import-stores-every-line");

  stored.value = canonicalRecords(
    JSON.parse(stored.value).map((row) => ({ ...row, currency: "USD" }))
  );

  const currencies = judgeRecords(currencyOnly);
  const currencyText = currencies.failures.join("\n");

  assert.equal(currencies.passed, false, currencyText);
  assert.ok(currencyText.includes("EUR"), currencyText);
  assert.ok(currencyText.includes("USD"), currencyText);
});

test("a readback replaced by the write response fails", () => {
  const records = passingRecords();
  const step = records.find((record) => record.step === "bank-line-edit");

  const readback = step.observations.find(
    (entry) => entry.id === "bank-line-edit-stores-category-and-note"
  );

  const reply = step.observations.find(
    (entry) => entry.id === "bank-line-edit-sets-category-and-note"
  );

  readback.value = reply.value;

  const result = judgeRecords(records);
  const text = result.failures.join("\n");

  assert.equal(result.passed, false, text);
  assert.ok(text.includes("bank-line-edit-stores-category-and-note"), text);
  assert.match(text, /expects a record set and observed/u);
});

test("a readback through the write operation, or with no read operation, fails", () => {
  const records = passingRecords();
  const step = records.find((record) => record.step === "bank-line-review");

  const readback = step.observations.find(
    (entry) => entry.id === "bank-line-review-shows-in-the-list"
  );

  readback.operation = "reviewBankLine";

  const throughWrite = judgeRecords(records);
  const text = throughWrite.failures.join("\n");

  assert.equal(throughWrite.passed, false, text);
  assert.match(
    text,
    /bank-line-review-shows-in-the-list observed through the write operation reviewBankLine/u
  );

  const unnamed = passingRecords();

  const unnamedStep = unnamed.find(
    (record) => record.step === "bank-line-review"
  );

  unnamedStep.observations.find(
    (entry) => entry.id === "bank-line-review-shows-in-the-list"
  ).operation = "";

  const wrong = judgeRecords(unnamed);

  assert.equal(wrong.passed, false);
  assert.match(
    wrong.failures.join("\n"),
    /bank-line-review-shows-in-the-list observed through operation none/u
  );

  const unreadable = structuredClone(table);

  const { expectations } = unreadable.steps.find(
    (entry) => entry.id === "bank-line-review"
  );

  delete expectations.find(
    (entry) => entry.id === "bank-line-review-shows-in-the-list"
  ).readOperation;

  const missing = judgeRecords(passingRecords(), unreadable);

  assert.equal(missing.passed, false);
  assert.match(
    missing.failures.join("\n"),
    /bank-line-review-shows-in-the-list names no read operation/u
  );
});

test("a careless write step fails by name when the marks are removed", () => {
  const caseTable = structuredClone(table);
  const step = caseTable.steps.find((entry) => entry.id === "bank-line-edit");

  delete step.writes;

  for (const expectation of step.expectations) {
    delete expectation.readback;
  }

  const records = passingRecords();

  records.find((entry) => entry.step === "bank-line-edit").mutatingCalls = 2;

  const result = judgeRecords(records, caseTable);
  const text = result.failures.join("\n");

  assert.equal(result.passed, false, text);
  assert.match(
    text,
    /step bank-line-edit recorded 2 mutating calls but is not marked as writing/u
  );
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
