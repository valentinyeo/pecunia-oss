#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SCRIPT_DIR = import.meta.dirname;

const arguments_ = process.argv.slice(2);

const rootIndex = arguments_.indexOf("--root");

const REPO_ROOT =
  rootIndex === -1
    ? path.join(SCRIPT_DIR, "..", "..", "..")
    : arguments_[rootIndex + 1];

const FEATURES_DIR = path.join(
  REPO_ROOT,
  "skills",
  "verify-pecunia",
  "features"
);

const README_PATH = path.join(FEATURES_DIR, "README.md");

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

    const filePath = path.join(directory, entry);

    if (statSync(filePath).isDirectory() === true) {
      walk(filePath, files);
      continue;
    }

    if (filePath.endsWith(".ts") === true) {
      files.push(filePath);
    }
  }

  return files;
};

const sourceFiles = [];

for (const workspace of ["packages", "apps"]) {
  for (const packageName of readdirSync(path.join(REPO_ROOT, workspace))) {
    const sourceDirectory = path.join(REPO_ROOT, workspace, packageName, "src");

    try {
      if (statSync(sourceDirectory).isDirectory() === false) {
        continue;
      }
    } catch {
      continue;
    }

    walk(sourceDirectory, sourceFiles);
  }
}

const capabilityFiles = sourceFiles.filter(
  (filePath) =>
    path
      .relative(REPO_ROOT, filePath)
      .startsWith(`packages${path.join("/", "capability")}/`) === false
);

const contractNames = new Map();

for (const filePath of capabilityFiles) {
  const source = readFileSync(filePath, "utf-8");

  const pattern =
    /(?:export\s+)?const\s+(?<binding>[A-Za-z0-9_]+)\s*=\s*defineContract\(\s*["'](?<contract>[^"']+)["']/gu;

  for (const match of source.matchAll(pattern)) {
    contractNames.set(match.groups.binding, match.groups.contract);
  }
}

const capabilities = new Map();

for (const filePath of capabilityFiles) {
  const source = readFileSync(filePath, "utf-8");

  const pattern =
    /(?:export\s+)?const\s+[A-Za-z0-9_]+\s*=\s*implement\(\s*(?<implemented>[A-Za-z0-9_]+)/gu;

  for (const match of source.matchAll(pattern)) {
    const name = contractNames.get(match.groups.implemented);

    if (name === undefined) {
      fail(
        "mapping",
        `${match.groups.implemented} is implemented in ${path.relative(REPO_ROOT, filePath)} with no defineContract name`
      );
      continue;
    }

    if (!capabilities.has(name)) {
      capabilities.set(name, path.relative(REPO_ROOT, filePath));
    }
  }
}

const pageNames = readdirSync(FEATURES_DIR)
  .filter((name) => Boolean(name.endsWith(".md")) && name !== "README.md")
  .toSorted();

const pages = new Map();

for (const pageName of pageNames) {
  const source = readFileSync(path.join(FEATURES_DIR, pageName), "utf-8");

  const status = /^Status: (?<status>[^.]+)\./mu
    .exec(source)
    ?.groups.status?.trim()
    .toLowerCase();

  const named = new Set();

  for (const match of sectionOf(source, "## Capabilities").matchAll(
    /^- `(?<name>[^`]+)`/gmu
  )) {
    named.add(match.groups.name);
  }

  pages.set(pageName, { named, status });
}

const readme = readFileSync(README_PATH, "utf-8");

const readmeStatus = new Map();

for (const match of readme.matchAll(
  /^\| \[[^\]]+\]\((?<page>[^)]+\.md)\) \| (?<status>[^|]+?) \|/gmu
)) {
  readmeStatus.set(match.groups.page, match.groups.status.trim().toLowerCase());
}

const notMoney = new Map();

for (const match of sectionOf(readme, "## Not money capabilities").matchAll(
  /^\| `(?<module>[^`]+)` \| (?<names>[^|]+?) \|/gmu
)) {
  const { module: modulePath, names: listed } = match.groups;

  const names = [...listed.matchAll(/`(?<name>[^`]+)`/gu)].map(
    (entry) => entry.groups.name
  );

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
