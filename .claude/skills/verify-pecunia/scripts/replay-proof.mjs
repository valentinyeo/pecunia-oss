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
import path from "node:path";

import { isBoolean, isNumber, isText } from "./lib/values.mjs";

const SCRIPT_DIR = import.meta.dirname;

const REPO_ROOT = path.join(SCRIPT_DIR, "..", "..", "..", "..");

const EVIDENCE_ROOT =
  process.env.PECUNIA_REPLAY_EVIDENCE_ROOT ??
  path.join(REPO_ROOT, ".claude", "skills", "verify-pecunia", "evidence");

const RUNNER =
  /^bash\s+(?<command>skills\/verify-pecunia\/scripts\/prove-demo-book\.sh\b.*)$/mu;

const failures = [];

const fail = (message) => {
  failures.push(message);
  process.stderr.write(`FAIL ${message}\n`);
};

const isRecord = (value) =>
  value !== null &&
  value !== undefined &&
  !isText(value) &&
  !isNumber(value) &&
  !isBoolean(value) &&
  !Array.isArray(value);

const asText = (value) => (isText(value) ? value : "");

const proofOf = (parsed) => {
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

const readProof = (file) => {
  let parsed;

  try {
    parsed = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }

  return isRecord(parsed) ? proofOf(parsed) : null;
};

const arguments_ = process.argv.slice(2);

const onlyIndex = arguments_.indexOf("--only");

const only = onlyIndex === -1 ? undefined : arguments_[onlyIndex + 1];

const evidenceDirectories = readdirSync(EVIDENCE_ROOT)
  .filter((name) => statSync(path.join(EVIDENCE_ROOT, name)).isDirectory())
  .filter((name) => only === undefined || name.endsWith(`-${only}`))
  .toSorted();

let missingChecks = 0;

let changedObservations = 0;

let replayed = 0;

const scratchRoot = mkdtempSync(path.join(tmpdir(), "pecunia-replay-"));

try {
  for (const directory of evidenceDirectories) {
    const savedDirectory = path.join(EVIDENCE_ROOT, directory);
    const proofPath = path.join(savedDirectory, "PROOF.md");
    const savedProofPath = path.join(savedDirectory, "proof.json");
    const proof = readFileSync(proofPath, "utf-8");

    const label =
      /^- Run label: `(?<label>[^`]+)`$/mu.exec(proof)?.groups.label ??
      directory.replace(/^\d{4}-\d{2}-\d{2}-/u, "");

    const command = RUNNER.exec(proof)?.groups.command;

    if (command === undefined) {
      fail(`${directory} records no prove-demo-book.sh command`);
      continue;
    }

    const replayLabel = `replay-${label}-${process.pid}`;
    const replayRoot = path.join(scratchRoot, directory);

    const replayCommand = [
      command.replace(/--label\s+\S+/u, `--label ${replayLabel}`),
      ...(command.includes("--label") ? [] : [` --label ${replayLabel}`]),
      ` --evidence-root ${replayRoot}`,
    ].join("");

    const result = spawnSync("bash", ["-c", replayCommand], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      fail(`${directory} replay exited ${result.status}`);
      continue;
    }

    const [replayProofDirectory] = readdirSync(replayRoot);

    const replayProof = readProof(
      path.join(replayRoot, replayProofDirectory, "proof.json")
    );

    if (replayProof === null) {
      fail(
        `${directory} replay wrote no usable proof.json under ${replayRoot}`
      );
      continue;
    }

    const saved = readProof(savedProofPath);

    if (saved === null) {
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
          `${directory} ${check.id} observed ${again.actual} (${again.passed === true ? "PASS" : "FAIL"}) instead of ${check.actual} (${check.passed === true ? "PASS" : "FAIL"})`
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
