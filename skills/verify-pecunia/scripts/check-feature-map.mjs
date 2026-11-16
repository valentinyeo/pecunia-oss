#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const arguments_ = process.argv.slice(2);
const rootIndex = arguments_.indexOf("--root");
const REPO_ROOT =
  rootIndex === -1
    ? join(SCRIPT_DIR, "..", "..", "..")
    : arguments_[rootIndex + 1];
const FEATURES_DIR = join(REPO_ROOT, "skills", "verify-pecunia", "features");
const README_PATH = join(FEATURES_DIR, "README.md");
const SKIPPED_DIRECTORIES = new Set([
  "__fixtures__",
  "dist",
  "node_modules",
  "test",
  "tests",
]);

const counts = {
  mapping: 0,
  planned: 0,
  status: 0,
  unexported: 0,
  unnamed: 0,
};

const fail = (category, line) => {
  counts[category] += 1;
  process.stderr.write(`FAIL ${line}\n`);
};

const problems = () =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

const sectionOf = (source, heading) => {
  const lines = source.split("\n");
  const start = lines.indexOf(heading);

  if (start === -1) {
    return "";
  }

  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith("## ")
  );

  return lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
};

const walk = (directory, files = []) => {
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) {
      continue;
    }

    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      walk(path, files);
      continue;
    }

    if (path.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
};

const sourceFiles = [];
for (const workspace of ["packages", "apps"]) {
  for (const packageName of readdirSync(join(REPO_ROOT, workspace))) {
    const sourceDirectory = join(REPO_ROOT, workspace, packageName, "src");

    try {
      if (!statSync(sourceDirectory).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    walk(sourceDirectory, sourceFiles);
  }
}

const capabilityFiles = sourceFiles.filter(
  (path) =>
    !relative(REPO_ROOT, path).startsWith(`packages${join("/", "capability")}/`)
);

const contractNames = new Map();
for (const path of capabilityFiles) {
  const source = readFileSync(path, "utf8");
  const pattern =
    /(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*defineContract\(\s*["']([^"']+)["']/gu;

  for (const match of source.matchAll(pattern)) {
    contractNames.set(match[1], match[2]);
  }
}

const capabilities = new Map();
for (const path of capabilityFiles) {
  const source = readFileSync(path, "utf8");
  const pattern =
    /(?:export\s+)?const\s+[A-Za-z0-9_]+\s*=\s*implement\(\s*([A-Za-z0-9_]+)/gu;

  for (const match of source.matchAll(pattern)) {
    const name = contractNames.get(match[1]);

    if (name === undefined) {
      fail(
        "mapping",
        `${match[1]} is implemented in ${relative(REPO_ROOT, path)} with no defineContract name`
      );
      continue;
    }

    if (!capabilities.has(name)) {
      capabilities.set(name, relative(REPO_ROOT, path));
    }
  }
}

const pageNames = readdirSync(FEATURES_DIR)
  .filter((name) => name.endsWith(".md") && name !== "README.md")
  .sort();

const pages = new Map();
for (const pageName of pageNames) {
  const source = readFileSync(join(FEATURES_DIR, pageName), "utf8");
  const status = /^Status: ([^.]+)\./mu.exec(source)?.[1]?.trim().toLowerCase();
  const named = new Set();

  for (const match of sectionOf(source, "## Capabilities").matchAll(
    /^- `([^`]+)`/gmu
  )) {
    named.add(match[1]);
  }

  pages.set(pageName, { named, status });
}

const readme = readFileSync(README_PATH, "utf8");
const readmeStatus = new Map();
for (const match of readme.matchAll(
  /^\| \[[^\]]+\]\(([^)]+\.md)\) \| ([^|]+?) \|/gmu
)) {
  readmeStatus.set(match[1], match[2].trim().toLowerCase());
}

const notMoney = new Map();
for (const match of sectionOf(readme, "## Not money capabilities").matchAll(
  /^\| `([^`]+)` \| ([^|]+?) \|/gmu
)) {
  const modulePath = match[1];
  const names = [...match[2].matchAll(/`([^`]+)`/gu)].map((entry) => entry[1]);

  for (const name of names) {
    notMoney.set(name, modulePath);
  }
}

const onPage = new Map();
for (const [pageName, page] of pages) {
  for (const name of page.named) {
    if (onPage.has(name)) {
      fail(
        "mapping",
        `${name} is on ${onPage.get(name)} and ${pageName}; one feature page owns a capability`
      );
      continue;
    }

    onPage.set(name, pageName);

    if (!capabilities.has(name)) {
      fail(
        "mapping",
        `${pageName} lists ${name} but no package or app implements that capability`
      );
    }

    if (page.status === "planned") {
      fail(
        "planned",
        `${name} exists on main but ${pageName} still marks the feature planned`
      );
    }
  }
}

for (const [name, modulePath] of capabilities) {
  if (onPage.has(name)) {
    continue;
  }

  const declared = notMoney.get(name);

  if (declared === undefined) {
    fail(
      "unnamed",
      `${name} (${modulePath}) is on no feature page and not in the not-money table`
    );
    continue;
  }

  if (declared !== modulePath) {
    fail(
      "mapping",
      `${name} is implemented in ${modulePath} but the not-money table says ${declared}`
    );
  }
}

for (const [name, modulePath] of notMoney) {
  if (!capabilities.has(name)) {
    fail(
      "unexported",
      `the not-money table lists ${name} but ${modulePath} does not implement it`
    );
  }
}

for (const [pageName, page] of pages) {
  const declared = readmeStatus.get(pageName);

  if (declared === undefined) {
    fail("status", `features/README.md has no status row for ${pageName}`);
    continue;
  }

  if (declared !== page.status) {
    fail(
      "status",
      `features/README.md says ${pageName} is ${declared} but the page says ${page.status}`
    );
  }
}

for (const pageName of readmeStatus.keys()) {
  if (!pages.has(pageName)) {
    fail(
      "status",
      `features/README.md links ${pageName}, which does not exist`
    );
  }
}

process.stdout.write(
  `SUMMARY unnamed=${counts.unnamed} unexported=${counts.unexported} planned=${counts.planned} status=${counts.status} mapping=${counts.mapping} problems=${problems()} capabilities=${capabilities.size} mapped=${onPage.size} notMoney=${notMoney.size}\n`
);

process.exit(problems() === 0 ? 0 : 1);
