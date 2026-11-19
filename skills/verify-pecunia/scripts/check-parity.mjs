#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SCRIPT_DIR = import.meta.dirname;

const PAGE_PATH = path.join("skills", "verify-pecunia", "parity", "README.md");

const arguments_ = process.argv.slice(2);

/**
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
const flagValue = (name, fallback) => {
  const index = arguments_.indexOf(name);

  return index === -1 ? fallback : arguments_[index + 1];
};

const REPO_ROOT = path.resolve(
  flagValue("--root", path.join(SCRIPT_DIR, "..", "..", ".."))
);

const pageArgument = flagValue("--page", PAGE_PATH);

const PAGE_FILE = path.isAbsolute(pageArgument)
  ? pageArgument
  : path.join(REPO_ROOT, pageArgument);

const SHOW_GAPS = arguments_.includes("--gaps");

const STATUSES = new Set(["built", "planned", "dropped"]);

const REFERENCE_KINDS = new Set(["capability", "command", "file"]);

const PLACE_KINDS = new Set(["page", "shell", "job", "sync", "import", "tool"]);

const NO_TICKET = "no ticket yet";

const TICKET_URL = /^https:\/\/app\.hypertask\.ai\/detail\/project-\d+\/\d+$/u;

const LINK = /^[a-z]+:\/\//u;

const MIN_REASON_WORDS = 6;

const SKIPPED_DIRECTORIES = new Set([
  "__fixtures__",
  "dist",
  "node_modules",
  "test",
  "tests",
]);

const counts = {
  dangling: 0,
  dropped: 0,
  duplicate: 0,
  emptyPlace: 0,
  reference: 0,
  page: 0,
  row: 0,
  status: 0,
  ticket: 0,
  unknownPlace: 0,
  where: 0,
};

/**
 * @param {string} category
 * @param {string} message
 * @returns {void}
 */
const fail = (category, message) => {
  counts[category] += 1;
  process.stderr.write(`FAIL ${category} ${message}\n`);
};

const problems = () =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

/**
 * @param {string} source
 * @param {string} heading
 * @returns {string}
 */
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

/**
 * @param {string} line
 * @returns {string[]}
 */
const cellsOf = (line) =>
  line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim().replaceAll("`", ""));

/**
 * @param {string} section
 * @returns {string[][]}
 */
const tableRows = (section) => {
  const rows = [];

  for (const line of section.split("\n")) {
    if (!line.startsWith("|")) {
      continue;
    }

    rows.push(cellsOf(line));
  }

  return rows.slice(2);
};

/**
 * @param {string} directory
 * @param {string[]} files
 * @returns {string[]}
 */
const walk = (directory, files) => {
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) {
      continue;
    }

    const filePath = path.join(directory, entry);

    if (statSync(filePath).isDirectory()) {
      walk(filePath, files);
      continue;
    }

    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      files.push(filePath);
    }
  }

  return files;
};

/**
 * @param {string[]} workspaces
 * @returns {string[]}
 */
const sourceFiles = (workspaces) => {
  const files = [];

  for (const workspace of workspaces) {
    const workspacePath = path.join(REPO_ROOT, workspace);

    if (!existsSync(workspacePath)) {
      continue;
    }

    for (const packageName of readdirSync(workspacePath)) {
      const sourceDirectory = path.join(workspacePath, packageName, "src");

      if (
        existsSync(sourceDirectory) &&
        statSync(sourceDirectory).isDirectory()
      ) {
        walk(sourceDirectory, files);
      }
    }
  }

  return files;
};

const declarations = new Map();

const implemented = new Set();

const commands = new Set();

const contractPattern =
  /(?:export\s+)?const\s+(?<binding>[A-Za-z0-9_]+)\s*=\s*defineContract\(\s*["'](?<contract>[^"']+)["']/gu;

const implementationPattern =
  /(?:export\s+)?const\s+[A-Za-z0-9_]+\s*=\s*implement\(\s*(?<implemented>[A-Za-z0-9_]+)/gu;

const commandPattern = /Command\.make\(\s*["'](?<command>[^"']+)["']/gu;

for (const filePath of sourceFiles(["packages", "apps"])) {
  const source = readFileSync(filePath, "utf-8");

  for (const match of source.matchAll(contractPattern)) {
    declarations.set(match.groups.binding, match.groups.contract);
  }

  for (const match of source.matchAll(implementationPattern)) {
    implemented.add(match.groups.implemented);
  }

  for (const match of source.matchAll(commandPattern)) {
    commands.add(match.groups.command);
  }
}

const capabilities = new Set();

for (const binding of implemented) {
  const name = declarations.get(binding);

  if (name !== undefined) {
    capabilities.add(name);
  }
}

if (!existsSync(PAGE_FILE)) {
  process.stderr.write(`FAIL page there is no parity page at ${PAGE_FILE}\n`);
  process.exit(1);
}

const source = readFileSync(PAGE_FILE, "utf-8");

const inventoryRows = tableRows(sectionOf(source, "## Old app inventory"));

const behaviourRows = tableRows(sectionOf(source, "## Behaviour"));

if (inventoryRows.length === 0) {
  process.stderr.write(
    "FAIL page the parity page has no old app inventory table\n"
  );
}

if (behaviourRows.length === 0) {
  process.stderr.write("FAIL page the parity page has no behaviour table\n");
}

const places = new Set();

for (const [label, kind] of inventoryRows) {
  if (label === undefined || label === "" || kind === undefined) {
    fail("row", "an inventory row is missing its label or its kind");
    continue;
  }

  if (!PLACE_KINDS.has(kind)) {
    fail(
      "reference",
      `the inventory calls ${label} a ${kind}; a place is one of ${[...PLACE_KINDS].join(", ")}`
    );
    continue;
  }

  if (places.has(label)) {
    fail("duplicate", `the inventory lists ${label} twice`);
    continue;
  }

  places.add(label);
}

const seen = new Map();

const used = new Map();

const gaps = [];

/**
 * @param {string} where
 * @returns {string[]}
 */
const refsOf = (where) =>
  where.split(",").map((entry) => entry.trim().replaceAll("`", ""));

/**
 * @param {string} reference
 * @param {{ behaviour: string, place: string, status: string, where: string }} row
 * @returns {void}
 */
const resolveReference = (reference, row) => {
  const separator = reference.indexOf(":");

  if (separator === -1) {
    fail(
      "reference",
      `"${row.behaviour}" says ${reference} in the where column; a built row points at capability:name, command:name or file:path`
    );

    return;
  }

  const kind = reference.slice(0, separator);
  const value = reference.slice(separator + 1);

  if (!REFERENCE_KINDS.has(kind)) {
    fail(
      "reference",
      `"${row.behaviour}" points at ${reference}; ${kind} is not one of ${[...REFERENCE_KINDS].join(", ")}`
    );

    return;
  }

  if (value === "") {
    fail("where", `"${row.behaviour}" has an empty ${kind} reference`);

    return;
  }

  if (kind === "capability" && !capabilities.has(value)) {
    fail(
      "dangling",
      `"${row.behaviour}" points at capability:${value}, which no package implements`
    );
  }

  if (kind === "command" && !commands.has(value)) {
    fail(
      "dangling",
      `"${row.behaviour}" points at command:${value}, which apps/cli does not define`
    );
  }

  if (kind === "file" && !existsSync(path.join(REPO_ROOT, value))) {
    fail(
      "dangling",
      `"${row.behaviour}" points at file:${value}, which is not in the repository`
    );
  }
};

for (const cells of behaviourRows) {
  if (cells.length !== 4) {
    fail(
      "row",
      `a behaviour row holds ${cells.length} cells instead of four: ${cells.join(" | ")}`
    );
    continue;
  }

  const [behaviour, place, status, where] = cells;
  const row = { behaviour, place, status, where };

  if (behaviour === "") {
    fail("row", `a row for ${place} has no behaviour text`);
  }

  if (status === "") {
    fail("status", `"${behaviour}" has no status`);
  } else if (!STATUSES.has(status)) {
    fail(
      "status",
      `"${behaviour}" is ${status}; a status is exactly built, planned or dropped`
    );
  }

  if (where === "") {
    fail("where", `"${behaviour}" has no where`);
  }

  if (place === "") {
    fail("row", `"${behaviour}" names no old place`);
  } else if (places.has(place)) {
    used.set(place, (used.get(place) ?? 0) + 1);
  } else {
    fail(
      "unknownPlace",
      `"${behaviour}" names ${place}, which the old app inventory does not list`
    );
  }

  const key = behaviour.toLowerCase().replaceAll(/\s+/gu, " ").trim();

  if (seen.has(key)) {
    fail(
      "duplicate",
      `"${behaviour}" appears twice, for ${seen.get(key)} and ${place}`
    );
  } else {
    seen.set(key, place);
  }

  if (status === "built" && where !== "") {
    for (const reference of refsOf(where)) {
      resolveReference(reference, row);
    }
  }

  if (status === "planned" && where !== "") {
    if (where === NO_TICKET) {
      gaps.push(behaviour);
    } else if (where.startsWith("ticket:")) {
      if (!TICKET_URL.test(where.slice("ticket:".length))) {
        fail(
          "ticket",
          `"${behaviour}" names ${where}; a planned row names ticket: and one app.hypertask.ai detail URL`
        );
      }
    } else {
      fail(
        "ticket",
        `"${behaviour}" is planned and names no ticket URL; write ticket:https://app.hypertask.ai/detail/project-<id>/<number> or ${NO_TICKET}`
      );
    }
  }

  if (status === "dropped" && where !== "") {
    if (LINK.test(where) || where.startsWith("ticket:")) {
      fail("dropped", `"${behaviour}" is dropped and points at a link`);
    } else if (where.split(/\s+/u).length < MIN_REASON_WORDS) {
      fail(
        "dropped",
        `"${behaviour}" is dropped and gives no reason; write at least ${MIN_REASON_WORDS} words`
      );
    }
  }
}

for (const place of places) {
  if (!used.has(place)) {
    fail(
      "emptyPlace",
      `the old app inventory lists ${place} and no row covers it`
    );
  }
}

if (SHOW_GAPS) {
  for (const behaviour of gaps) {
    process.stdout.write(
      `GAP ${behaviour} | ${seen.get(behaviour.toLowerCase().replaceAll(/\s+/gu, " ").trim())}\n`
    );
  }
}

/**
 * @param {string} status
 * @returns {number}
 */
const statusCount = (status) =>
  behaviourRows.filter((cells) => cells[2] === status).length;

process.stdout.write(
  `SUMMARY rows=${behaviourRows.length} built=${statusCount("built")} planned=${statusCount("planned")} dropped=${statusCount("dropped")} places=${places.size} gaps=${gaps.length} problems=${problems()}\n`
);

process.exit(problems() === 0 ? 0 : 1);
