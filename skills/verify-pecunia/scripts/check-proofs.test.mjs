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

import { judge, readCapabilities } from "./verdict.mjs";

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
const stepsById = new Map(table.steps.map((step) => [step.id, step]));

const makeRandom = (seed) => {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;

    return state / 4_294_967_296;
  };
};

const pick = (random, items) => items[Math.floor(random() * items.length)];

const passingRecords = (feature = FEATURE) =>
  table.features[feature].map((id) => {
    const step = stepsById.get(id);

    return {
      artifacts: step.artifacts.map((name) => ({
        found: true,
        name,
        path: join(tmpdir(), name),
      })),
      checks: [
        {
          actual: "ok",
          expected: "ok",
          id: `probe-${id}`,
          title: `Probe for ${id}`,
        },
      ],
      commands: step.commands.map((command) => ({ exit: 0, id: command })),
      data: {},
      exit: 0,
      feature,
      outputs: step.outputs.map((name) => ({ found: true, name })),
      step: id,
    };
  });

const judgeRecords = (records, caseTable = table) =>
  judge({
    capabilities,
    feature: FEATURE,
    records,
    recordsPath: RECORDS_PATH,
    table: caseTable,
  });

const mutate = (records, random) => {
  const kind = Math.floor(random() * 8);

  if (kind === 0) {
    const index = Math.floor(random() * records.length);

    return {
      cause: records[index].step,
      records: records.filter((_, position) => position !== index),
      table,
    };
  }

  if (kind === 1) {
    const index = Math.floor(random() * records.length);
    const next = structuredClone(records);

    next.push(structuredClone(records[index]));

    return { cause: records[index].step, records: next, table };
  }

  if (kind === 2) {
    const eligible = records.filter((record) => record.commands.length > 0);
    const record = pick(random, eligible);
    const command = pick(random, record.commands);
    const next = structuredClone(records);
    const target = next
      .find((entry) => entry.step === record.step)
      .commands.find((entry) => entry.id === command.id);

    target.exit = 1;

    return { cause: command.id, records: next, table };
  }

  if (kind === 3) {
    const eligible = records.filter((record) => record.outputs.length > 0);
    const record = pick(random, eligible);
    const output = pick(random, record.outputs);
    const next = structuredClone(records);

    next
      .find((entry) => entry.step === record.step)
      .outputs.find((entry) => entry.name === output.name).found = false;

    return { cause: output.name, records: next, table };
  }

  if (kind === 4) {
    const next = structuredClone(records);
    const ghost = "probe-ghost-step";

    next.push({
      artifacts: [],
      checks: [],
      commands: [],
      data: {},
      exit: 0,
      feature: FEATURE,
      outputs: [],
      step: ghost,
    });

    return { cause: ghost, records: next, table };
  }

  if (kind === 5) {
    return { cause: "empty", records: [], table };
  }

  if (kind === 6) {
    const names = [...capabilities.values()].flat();
    const name = pick(random, names);
    const caseTable = structuredClone(table);

    for (const step of caseTable.steps) {
      step.capabilities = step.capabilities.filter((entry) => entry !== name);
    }

    return { cause: name, records: structuredClone(records), table: caseTable };
  }

  return { cause: "missing", records: undefined, table };
};

const injectStepFailure = (source, id) => {
  const header = `step_${id.replaceAll("-", "_")}() {`;
  const step = stepsById.get(id);

  assert.ok(source.includes(header), `${header} is missing`);

  const line =
    step.commands.length > 0
      ? `steps_run_command ${step.commands[0]} false`
      : `check injected-${id} "Injected failure" expected observed`;

  return source.replace(header, `${header}\n  ${line}`);
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

test("the unmutated helper passes", () => {
  const result = runProof(SCRIPT_PATH, "check-whole");
  const expected = new RegExp(
    `^PASS ${table.features[FEATURE].length} steps, \\d+ checks, 0 failed\\.$`,
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
    } = mutate(passingRecords(), random);
    const result = judgeRecords(records, caseTable);
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

test("a failing command in every step fails the helper closed", () => {
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
