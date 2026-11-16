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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..", "..");
const SCRIPT_PATH = join(SCRIPT_DIR, "prove-demo-book.sh");
const MAP_PATH = join(SCRIPT_DIR, "check-feature-map.mjs");
const MUTANT_PREFIX = join(SCRIPT_DIR, ".check-mutant-");

const scratchRoot = mkdtempSync(join(tmpdir(), "pecunia-check-"));
let runCount = 0;

const sweepMutants = () => {
  for (const name of readdirSync(SCRIPT_DIR)) {
    if (join(SCRIPT_DIR, name).startsWith(MUTANT_PREFIX)) {
      rmSync(join(SCRIPT_DIR, name), { force: true });
    }
  }
};

process.on("exit", sweepMutants);

const runProof = (scriptPath, feature = "all") => {
  runCount += 1;
  const result = spawnSync(
    "bash",
    [
      scriptPath,
      "--feature",
      feature,
      "--label",
      `check-${runCount}`,
      "--evidence-root",
      join(scratchRoot, `run-${runCount}`),
    ],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );

  return {
    output: `${result.stdout}${result.stderr}`,
    status: result.status,
    stdout: result.stdout,
  };
};

const passed = (result) =>
  /^PASS \d+ steps, \d+ checks, 0 failed\.$/mu.test(result.stdout);

const runMutant = (slug, mutate, feature = "all") => {
  const path = join(SCRIPT_DIR, `.check-mutant-${process.pid}-${slug}.sh`);
  try {
    writeFileSync(path, mutate(readFileSync(SCRIPT_PATH, "utf8")), {
      mode: 0o755,
    });
    return runProof(path, feature);
  } finally {
    rmSync(path, { force: true });
  }
};

const declaredSteps = (feature = "all") => {
  const result = spawnSync(
    "bash",
    [SCRIPT_PATH, "--list-steps", "--feature", feature],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [name, kind, command] = line.split("\t");
      return { command, kind, name };
    });
};

const stepFunction = (name) => `step_${name.replaceAll("-", "_")}`;

const injectAfterHeader = (name, line) => (source) => {
  const header = `${stepFunction(name)}() {`;
  assert.ok(source.includes(header), `${header} is missing`);
  return source.replace(header, `${header}\n  ${line}`);
};

const writeFakeMapRoot = (withCapability) => {
  const root = mkdtempSync(join(scratchRoot, "map-root-"));
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
    fields,
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

  for (const feature of ["all", "invoices", "accounts-and-bank-lines"]) {
    for (const step of declaredSteps(feature)) {
      assert.ok(
        functions.has(step.name),
        `the ${feature} table declares ${step.name}, which has no step function`
      );
      declared.add(step.name);
    }
  }

  const orphaned = [...functions].filter((name) => !declared.has(name));
  assert.deepEqual(
    orphaned,
    [],
    `step functions with no table entry: ${orphaned.join(", ")}`
  );
});

test("the unmutated helper passes", () => {
  const result = runProof(SCRIPT_PATH);
  assert.equal(result.status, 0, result.output);
  assert.match(
    result.stdout,
    new RegExp(
      `^PASS ${declaredSteps().length} steps, \\d+ checks, 0 failed\\.$`,
      "mu"
    )
  );
});

test("the repository feature map reports no problems", () => {
  const result = spawnSync("node", [MAP_PATH], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /problems=0/u);
});

test("every declared step fails the helper closed", async (context) => {
  for (const step of declaredSteps()) {
    await context.test(
      `step ${step.name} exiting non-zero fails the helper`,
      () => {
        const result = runMutant(
          `${step.name}-exit`,
          injectAfterHeader(step.name, "return 1")
        );
        assert.notEqual(result.status, 0, result.output);
        assert.equal(passed(result), false, result.output);
        assert.match(result.output, new RegExp(step.name, "u"));
      }
    );

    await context.test(
      `step ${step.name} writing no output fails the helper`,
      () => {
        const result = runMutant(
          `${step.name}-empty`,
          injectAfterHeader(step.name, "return 0")
        );
        assert.notEqual(result.status, 0, result.output);
        assert.equal(passed(result), false, result.output);
      }
    );
  }
});

test("a step whose check fails fails the helper", () => {
  const result = runMutant(
    "failing-check",
    injectAfterHeader(
      "generic",
      'check faked-check "Faked observation" ok wrong'
    )
  );
  assert.notEqual(result.status, 0, result.output);
  assert.equal(passed(result), false, result.output);
  assert.match(result.output, /checks failed/u);
});

test("a step with no table entry fails the helper by name", () => {
  const result = runMutant("rogue-step", (source) => {
    assert.ok(source.includes("if steps_finish; then"));
    return source.replace(
      "if steps_finish; then",
      "steps_run_step rogue-step\nif steps_finish; then"
    );
  });
  assert.notEqual(result.status, 0, result.output);
  assert.equal(passed(result), false, result.output);
  assert.match(result.output, /step rogue-step is not in the step table/u);
});

test("a helper that ignores the map exit code fails by name", () => {
  const result = runMutant("swallowed-exit", (source) => {
    const recorded =
      'map_line=$(steps_run_command map node "$SCRIPT_DIR/check-feature-map.mjs" 2> "$MAP_LOG")';
    assert.ok(
      source.includes(recorded),
      "the map step no longer records its exit code"
    );
    return source.replace(
      recorded,
      'map_line=$(node "$SCRIPT_DIR/check-feature-map.mjs" 2> "$MAP_LOG" || true)'
    );
  });
  assert.notEqual(result.status, 0, result.output);
  assert.equal(passed(result), false, result.output);
  assert.match(result.output, /command map did not run/u);
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
