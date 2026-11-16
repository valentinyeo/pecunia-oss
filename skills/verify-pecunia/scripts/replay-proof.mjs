#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..", "..");
const EVIDENCE_ROOT = join(REPO_ROOT, "skills", "verify-pecunia", "evidence");
const RUNNER =
  /^bash\s+(skills\/verify-pecunia\/scripts\/prove-demo-book\.sh\b.*)$/mu;

const failures = [];
const fail = (message) => {
  failures.push(message);
  process.stderr.write(`FAIL ${message}\n`);
};

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asText = (value) => (typeof value === "string" ? value : "");

const readProof = (path) => {
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) {
    return undefined;
  }

  const checks = Array.isArray(parsed.checks) ? parsed.checks : [];

  return {
    checks: checks.flatMap((check) =>
      isRecord(check)
        ? [
            {
              actual: asText(check.actual),
              expected: asText(check.expected),
              id: asText(check.id),
              passed: check.passed === true,
            },
          ]
        : []
    ),
    demoBookSha256: asText(parsed.demoBookSha256),
  };
};

const arguments_ = process.argv.slice(2);
const onlyIndex = arguments_.indexOf("--only");
const only = onlyIndex === -1 ? undefined : arguments_[onlyIndex + 1];

const evidenceDirectories = readdirSync(EVIDENCE_ROOT)
  .filter((name) => statSync(join(EVIDENCE_ROOT, name)).isDirectory())
  .filter((name) => only === undefined || name.endsWith(`-${only}`))
  .sort();

let missingChecks = 0;
let changedObservations = 0;
let replayed = 0;
const scratchRoot = mkdtempSync(join(tmpdir(), "pecunia-replay-"));

try {
  for (const directory of evidenceDirectories) {
    const savedDirectory = join(EVIDENCE_ROOT, directory);
    const proofPath = join(savedDirectory, "PROOF.md");
    const savedProofPath = join(savedDirectory, "proof.json");
    const proof = readFileSync(proofPath, "utf8");
    const label =
      /^- Run label: `([^`]+)`$/mu.exec(proof)?.[1] ??
      directory.replace(/^\d{4}-\d{2}-\d{2}-/u, "");
    const command = RUNNER.exec(proof)?.[1];

    if (command === undefined) {
      fail(`${directory} records no prove-demo-book.sh command`);
      continue;
    }

    const replayLabel = `replay-${label}-${process.pid}`;
    const replayRoot = join(scratchRoot, directory);
    const replayCommand = command
      .replace(/--label\s+\S+/u, `--label ${replayLabel}`)
      .concat(
        command.includes("--label") ? "" : ` --label ${replayLabel}`,
        ` --evidence-root ${replayRoot}`
      );
    const result = spawnSync("bash", ["-c", replayCommand], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });

    if (result.status !== 0) {
      fail(`${directory} replay exited ${result.status}`);
      continue;
    }

    const replayProofDirectory = readdirSync(replayRoot)[0];
    const replayProof = readProof(
      join(replayRoot, replayProofDirectory, "proof.json")
    );

    if (replayProof === undefined) {
      fail(
        `${directory} replay wrote no usable proof.json under ${replayRoot}`
      );
      continue;
    }

    const saved = readProof(savedProofPath);

    if (saved === undefined) {
      fail(`${directory} has no usable proof.json`);
      continue;
    }

    const replayedById = new Map(
      replayProof.checks.map((check) => [check.id, check])
    );

    for (const check of saved.checks) {
      const again = replayedById.get(check.id);

      if (again === undefined) {
        missingChecks += 1;
        fail(`${directory} saved ${check.id}, which the replay no longer runs`);
        continue;
      }

      if (
        again.passed !== check.passed ||
        again.expected !== check.expected ||
        again.actual !== check.actual
      ) {
        changedObservations += 1;
        fail(
          `${directory} ${check.id} observed ${again.actual} (${again.passed ? "PASS" : "FAIL"}) instead of ${check.actual} (${check.passed ? "PASS" : "FAIL"})`
        );
      }
    }

    if (saved.demoBookSha256 !== replayProof.demoBookSha256) {
      changedObservations += 1;
      fail(
        `${directory} replayed a demo book with SHA-256 ${replayProof.demoBookSha256} instead of ${saved.demoBookSha256}`
      );
    }

    replayed += 1;
  }
} finally {
  rmSync(scratchRoot, { force: true, recursive: true });
}

process.stdout.write(
  `saved proofs replay: ${missingChecks} missing checks, ${changedObservations} changed observations across ${replayed} proofs\n`
);

process.exit(failures.length === 0 ? 0 : 1);
