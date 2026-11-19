// @effect-diagnostics nodeBuiltinImport:off -- This test runs the parity checker as a child Node process and reads its exit code and its messages.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "..");

const checkerPath = path.join(
  repoRoot,
  "skills",
  "verify-pecunia",
  "scripts",
  "check-parity.mjs"
);

const pagePath = path.join(
  repoRoot,
  "skills",
  "verify-pecunia",
  "parity",
  "README.md"
);

const fixturesRoot = path.join(
  repoRoot,
  "skills",
  "verify-pecunia",
  "scripts",
  "__fixtures__",
  "parity"
);

interface CheckRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const runCheck = (arguments_: readonly string[]): CheckRun => {
  const result = spawnSync("node", [checkerPath, ...arguments_], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

const runFixture = (fixture: string): CheckRun =>
  runCheck(["--page", path.join(fixturesRoot, fixture)]);

const brokenPages: readonly {
  readonly fixture: string;
  readonly category: string;
  readonly named: string;
}[] = [
  {
    fixture: "missing-status.md",
    category: "status",
    named: "A behaviour with no status at all",
  },
  {
    fixture: "missing-where.md",
    category: "where",
    named: "A behaviour with no where at all",
  },
  {
    fixture: "dangling-capability.md",
    category: "dangling",
    named: "capability:listNothingAtAll",
  },
  {
    fixture: "dangling-file.md",
    category: "dangling",
    named: "packages/nowhere/src/nothing.ts",
  },
  {
    fixture: "planned-no-ticket.md",
    category: "ticket",
    named: "A planned behaviour with no ticket",
  },
  {
    fixture: "dropped-no-reason.md",
    category: "dropped",
    named: "A dropped behaviour with no reason",
  },
  {
    fixture: "duplicate.md",
    category: "duplicate",
    named: "recorded on two pages",
  },
  {
    fixture: "unknown-place.md",
    category: "unknownPlace",
    named: "route: three",
  },
  {
    fixture: "empty-place.md",
    category: "emptyPlace",
    named: "route: two",
  },
  {
    fixture: "unknown-reference.md",
    category: "reference",
    named: "surface:somewhere",
  },
  {
    fixture: "wrong-cells.md",
    category: "row",
    named: "A row that lost its where column",
  },
];

describe("the parity check", () => {
  it("passes on the real parity page and counts its rows", () => {
    const run = runCheck([]);

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(
      /^SUMMARY rows=\d+ built=\d+ planned=\d+ dropped=\d+ places=\d+ gaps=\d+ problems=0$/mu
    );
  });

  it("passes on a good fixture page", () => {
    const run = runFixture("good.md");

    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  it("lists one gap per planned behaviour with no ticket", () => {
    const run = runCheck(["--gaps"]);

    const gaps = run.stdout
      .split("\n")
      .filter((line) => line.startsWith("GAP "));

    const counted = /gaps=(?<gaps>\d+)/u.exec(run.stdout)?.groups?.gaps;

    expect(run.status).toBe(0);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.length).toBe(Number(counted));
  });

  for (const page of brokenPages) {
    it(`fails by name on ${page.fixture}`, () => {
      const run = runFixture(page.fixture);

      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`FAIL ${page.category} `);
      expect(run.stderr).toContain(page.named);
    });
  }

  it("fails by name when every row for an old place goes", () => {
    const scratchDirectory = mkdtempSync(path.join(tmpdir(), "parity-page-"));
    const scratchPage = path.join(scratchDirectory, "README.md");
    const source = readFileSync(pagePath, "utf-8");

    const withoutForecast = source
      .split("\n")
      .filter(
        (line) =>
          line.split("|").length !== 6 || !line.includes("| route: forecast |")
      )
      .join("\n");

    writeFileSync(scratchPage, withoutForecast);

    const run = runCheck(["--page", scratchPage]);

    rmSync(scratchDirectory, { recursive: true, force: true });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("FAIL emptyPlace ");
    expect(run.stderr).toContain("route: forecast");
  });
});
