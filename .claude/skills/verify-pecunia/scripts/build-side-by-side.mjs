#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const SCRIPT_DIR = import.meta.dirname;

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
  flagValue("--root", path.join(SCRIPT_DIR, "..", "..", "..", ".."))
);

const PAGE_FILE = path.join(
  REPO_ROOT,
  ".claude",
  "skills",
  "verify-pecunia",
  "parity",
  "README.md"
);

const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  ".claude",
  "skills",
  "verify-pecunia",
  "evidence"
);

const STEP_TABLE = path.join(SCRIPT_DIR, "step-table.json");

const OLD_DIRECTORY = path.resolve(flagValue("--old", "/tmp/pecunia-rs/old"));

const OUTPUT_FILE = path.resolve(
  flagValue("--out", "/tmp/pecunia-rs/page/side-by-side.html")
);

/**
 * @typedef {{ capability: string, note: string }} Shown
 * @typedef {{ gap?: string, id: string, oldGap?: string, oldRoute: string | null, places: string[], route: string, shows: Shown[], step: string }} Screen
 * @typedef {{ behaviour: string, place: string, status: string, where: string }} ParityRow
 * @typedef {{ actual: string, expected: string, id: string, passed: boolean, step: string }} Check
 * @typedef {{ drives: string[], matches: { capability: string, note: string, screen: string }[], row: ParityRow }} ReportEntry
 * @typedef {{ capabilities: string[], id: string }} Step
 * @typedef {{ artifact: string | null, id: string }} DriveStep
 * @typedef {{ branch?: string, checks: Check[], commit?: string, passed?: number, ranAt?: string, total?: number }} Proof
 * @typedef {{ entry: string, folder: string, proof: Proof }} EvidenceRun
 * @typedef {{ steps: Step[] }} StepTable
 */

/** @type {Screen[]} */
const screens = [
  {
    id: "dashboard",
    places: ["route: dashboard"],
    oldRoute: "/",
    route: "/app",
    step: "web-dashboard",
    shows: [
      {
        capability: "readDashboard",
        note: "the figures on this screen come from a client fixture, not the demo book",
      },
    ],
  },
  {
    id: "transactions",
    places: ["route: transactions", "route: transaction detail"],
    oldRoute: "/transactions",
    route: "/app/transactions",
    step: "web-transactions",
    shows: [
      {
        capability: "listBankLines",
        note: "the twelve lines are a client fixture, not the demo book",
      },
      {
        capability: "editBankLine",
        note: "the Edit button opens a Category and Note form; a save stays in the browser",
      },
    ],
  },
  {
    id: "review",
    places: ["route: review"],
    oldRoute: "/review",
    route: "/app/review",
    step: "web-review",
    shows: [],
  },
  {
    id: "search",
    places: ["route: search"],
    oldRoute: "/search",
    route: "/app/search",
    step: "web-search",
    shows: [],
  },
  {
    id: "budgets",
    places: [],
    oldRoute: null,
    route: "/app/budgets",
    step: "web-budgets",
    shows: [],
    gap: "the screen is a placeholder that says it lands in a later slice",
    oldGap:
      "the old app had no budgets page, so there is no old side to put here",
  },
  {
    id: "subscriptions",
    places: ["route: subscriptions"],
    oldRoute: "/subscriptions",
    route: "/app/subscriptions",
    step: "web-subscriptions",
    shows: [
      {
        capability: "listSubscriptions",
        note: "the two demo repeat payments with their monthly and yearly cost, from the screen's demo gateway",
      },
      {
        capability: "changeSubscriptionStatus",
        note: "the shot follows a Cancel click, so both rows read Cancelled and the active yearly total is zero; the screen has no confirm, dismiss or tracking control",
      },
      {
        capability: "findRepeatPayments",
        note: "each row carries the confidence the detector gave it, 96 and 61 per cent",
      },
    ],
  },
  {
    id: "investments",
    places: ["route: investments"],
    oldRoute: "/investments",
    route: "/app/investments",
    step: "web-investments",
    shows: [
      {
        capability: "readInvestmentPortfolio",
        note: "holdings grouped by platform with value and gain, drawn from a client fixture",
      },
    ],
  },
  {
    id: "categories",
    places: ["route: categories", "route: category management"],
    oldRoute: "/categories",
    route: "/app/categories",
    step: "web-categories",
    shows: [
      {
        capability: "readCategories",
        note: "spend per category with the share of the total, drawn from a client fixture",
      },
    ],
  },
  {
    id: "rules",
    places: ["route: rules"],
    oldRoute: "/categories/rules",
    route: "/app/rules",
    step: "web-rules",
    shows: [],
    gap: "the screen renders a rules table, but no rule capability is built yet",
  },
  {
    id: "aliases",
    places: ["route: aliases"],
    oldRoute: "/aliases",
    route: "/app/aliases",
    step: "web-aliases",
    shows: [],
    gap: "the screen renders an alias table, but no alias capability is built yet",
  },
  {
    id: "merchants",
    places: [
      "route: merchant list",
      "route: merchant list with rules",
      "route: merchant detail",
    ],
    oldRoute: "/merchants",
    route: "/app/merchants",
    step: "web-merchants",
    shows: [],
    gap: "the screen renders a merchant list, but no merchant capability is built yet",
  },
  {
    id: "settings",
    places: ["route: settings"],
    oldRoute: "/settings",
    route: "/app/settings",
    step: "web-settings",
    shows: [],
    gap: "the screen shows the demo values and the two demo profiles; it has no upload or profile form",
  },
];

const DEFAULT_OLD_REASON = "No old screenshot was captured for this screen.";

const OLD_SIDE_NOTE =
  "The old side is a local run of the old code at its origin/main, its own D1 migrations and a made-up demo book written for this report; the outside login gate was stubbed to a demo person for that local run only, because the real gate needs a live Cloudflare Access token and the live app is never opened.";

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
 * @param {string} value
 * @returns {string}
 */
const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/**
 * @param {string} filePath
 * @returns {string}
 */
const imageSource = (filePath) =>
  `data:image/png;base64,${readFileSync(filePath).toString("base64")}`;

/** @param {string} filePath */
const exists = (filePath) => existsSync(filePath);

/**
 * @param {string} directory
 * @returns {EvidenceRun[]}
 */
const evidenceRuns = (directory) => {
  if (!exists(directory)) {
    return [];
  }

  return readdirSync(directory)
    .filter((entry) => statSync(path.join(directory, entry)).isDirectory())
    .map((entry) => {
      const folder = path.join(directory, entry);
      const proofFile = path.join(folder, "proof.json");

      return {
        entry,
        folder,
        proof: exists(proofFile)
          ? JSON.parse(readFileSync(proofFile, "utf-8"))
          : null,
      };
    })
    .filter((run) => run.proof !== null)
    .toSorted(
      (left, right) =>
        String(right.proof.ranAt ?? right.entry).localeCompare(
          String(left.proof.ranAt ?? left.entry)
        ) || right.entry.localeCompare(left.entry)
    );
};

/**
 * @param {string} where
 * @returns {{ capability: string | null, kind: string, value: string }[]}
 */
const refsOf = (where) =>
  where.split(",").map((entry) => {
    const reference = entry.trim().replaceAll("`", "");
    const separator = reference.indexOf(":");

    if (separator === -1) {
      return { capability: null, kind: "none", value: reference };
    }

    return {
      capability:
        reference.slice(0, separator) === "capability"
          ? reference.slice(separator + 1)
          : null,
      kind: reference.slice(0, separator),
      value: reference.slice(separator + 1),
    };
  });

if (!exists(PAGE_FILE)) {
  process.stderr.write(
    `build-side-by-side needs the parity page at ${PAGE_FILE}\n`
  );
  process.exit(1);
}

const page = readFileSync(PAGE_FILE, "utf-8");

/** @type {ParityRow[]} */
const behaviourRows = tableRows(sectionOf(page, "## Behaviour")).map(
  ([behaviour, place, status, where]) => ({
    behaviour,
    place,
    status,
    where,
  })
);

if (behaviourRows.length === 0) {
  process.stderr.write(
    "build-side-by-side needs a behaviour table in the parity page\n"
  );
  process.exit(1);
}

/** @type {StepTable} */
const stepTable = JSON.parse(readFileSync(STEP_TABLE, "utf-8"));

/** @type {EvidenceRun[]} */
const runs = evidenceRuns(EVIDENCE_ROOT);

/**
 * @param {string} screenId
 * @returns {EvidenceRun | null}
 */
const shotRunOf = (screenId) =>
  runs.find((run) => exists(path.join(run.folder, `web-${screenId}.png`))) ??
  null;

/**
 * @param {string} stepId
 * @returns {EvidenceRun | null}
 */
const stepRunOf = (stepId) =>
  runs.find((run) => run.proof.checks.some((check) => check.step === stepId)) ??
  null;

/**
 * @param {EvidenceRun | null} run
 * @param {string} stepId
 * @returns {Check[]}
 */
const checksOf = (run, stepId) =>
  run === null ? [] : run.proof.checks.filter((check) => check.step === stepId);

/** @type {Map<string, Screen>} */
const screenById = new Map(screens.map((screen) => [screen.id, screen]));

/** @type {Map<string, { note: string, screen: string }[]>} */
const capabilityScreens = new Map();

for (const screen of screens) {
  for (const shown of screen.shows) {
    const collected = capabilityScreens.get(shown.capability) ?? [];

    collected.push({ note: shown.note, screen: screen.id });
    capabilityScreens.set(shown.capability, collected);
  }
}

const FEATURES_DIR = path.join(
  REPO_ROOT,
  ".claude",
  "skills",
  "verify-pecunia",
  "features"
);

const FEATURE_STATUS = path.join(FEATURES_DIR, "README.md");

/**
 * @param {string} source
 * @returns {[string, string][]}
 */
const featureTitlesOf = (source) =>
  source
    .split("\n")
    .map((line) => /\| \[(?<title>[^\]]+)\]\((?<file>[^)]+)\)/u.exec(line))
    .filter((match) => match !== null)
    .map((match) => [match.groups.file, match.groups.title]);

/**
 * @param {string} source
 * @returns {string[]}
 */
const capabilitiesOf = (source) =>
  [
    ...sectionOf(source, "## Capabilities").matchAll(
      /^- `(?<capability>[A-Za-z0-9_]+)`/gmu
    ),
  ].map((match) => match.groups.capability);

/**
 * @returns {Map<string, string>}
 */
const capabilityPages = () => {
  /** @type {Map<string, string>} */
  const pages = new Map();

  if (!exists(FEATURE_STATUS)) {
    return pages;
  }

  for (const [file, title] of featureTitlesOf(
    readFileSync(FEATURE_STATUS, "utf-8")
  )) {
    const filePath = path.join(FEATURES_DIR, file);

    if (!exists(filePath)) {
      continue;
    }

    for (const capability of capabilitiesOf(readFileSync(filePath, "utf-8"))) {
      if (!pages.has(capability)) {
        pages.set(capability, title);
      }
    }
  }

  return pages;
};

/** @type {Map<string, string>} */
const capabilityPage = capabilityPages();

/** @type {Map<string, string[]>} */
const driveSteps = new Map();

for (const step of stepTable.steps) {
  for (const capability of step.capabilities ?? []) {
    const collected = driveSteps.get(capability) ?? [];

    collected.push(step.id);
    driveSteps.set(capability, collected);
  }
}

/** @type {Map<string, DriveStep>} */
const stepById = new Map(
  stepTable.steps.map((step) => [
    step.id,
    {
      artifact:
        (step.artifacts ?? []).find((name) => name.endsWith(".json")) ?? null,
      id: step.id,
    },
  ])
);

const oldReasonFile = path.join(OLD_DIRECTORY, "reason.txt");

const oldReason = exists(oldReasonFile)
  ? readFileSync(oldReasonFile, "utf-8").trim()
  : DEFAULT_OLD_REASON;

/**
 * @param {string} screenId
 * @returns {string | null}
 */
const oldShotOf = (screenId) => {
  const filePath = path.join(OLD_DIRECTORY, `${screenId}.png`);

  return exists(filePath) ? filePath : null;
};

/**
 * @param {string} screenId
 * @returns {string | null}
 */
const newShotOf = (screenId) => {
  const run = shotRunOf(screenId);

  return run === null ? null : path.join(run.folder, `web-${screenId}.png`);
};

/**
 * @param {{ behaviour: string, place: string, status: string, where: string }} row
 * @returns {{ capability: string, note: string, screen: string }[]}
 */
const screenMatches = (row) => {
  const matches = [];

  for (const reference of refsOf(row.where)) {
    if (reference.capability === null) {
      continue;
    }

    for (const match of capabilityScreens.get(reference.capability) ?? []) {
      const screen = screenById.get(match.screen);

      if (!screen.places.includes(row.place)) {
        continue;
      }

      matches.push({
        capability: reference.capability,
        note: match.note,
        screen: match.screen,
      });
    }
  }

  return matches;
};

/**
 * @param {{ behaviour: string, place: string, status: string, where: string }} row
 * @returns {string[]}
 */
const driveMatches = (row) => {
  const matched = new Set();

  for (const reference of refsOf(row.where)) {
    if (reference.capability === null) {
      continue;
    }

    for (const step of driveSteps.get(reference.capability) ?? []) {
      matched.add(step);
    }
  }

  return [...matched].toSorted((left, right) => left.localeCompare(right));
};

/** @type {ReportEntry[]} */
const report = behaviourRows.map((row) => {
  const matches = screenMatches(row);
  const drives = driveMatches(row);

  return { drives, matches, row };
});

/**
 * @param {string} status
 * @returns {string}
 */
const noPairText = (status) => {
  if (status === "built") {
    return "No screenshot: no screen in the browser drive shows this behaviour.";
  }

  if (status === "planned") {
    return "No screenshot: this behaviour has no user surface in either app yet.";
  }

  return "No screenshot: this behaviour is not carried over.";
};

const statusCount = (status) =>
  report.filter((entry) => entry.row.status === status).length;

const withNewShot = report.filter(
  (entry) =>
    entry.row.status === "built" &&
    entry.matches.some((match) => newShotOf(match.screen) !== null)
);

const withPair = withNewShot.filter((entry) =>
  entry.matches.some(
    (match) =>
      newShotOf(match.screen) !== null && oldShotOf(match.screen) !== null
  )
);

const oldMissing = withNewShot.filter(
  (entry) =>
    !entry.matches.some(
      (match) =>
        newShotOf(match.screen) !== null && oldShotOf(match.screen) !== null
    )
);

const screenPairCount = (screenId) =>
  report.filter(
    (entry) =>
      entry.row.status === "built" &&
      newShotOf(screenId) !== null &&
      entry.matches.some((match) => match.screen === screenId)
  ).length;

/**
 * @param {{ capability: string, note: string, screen: string }[]} matches
 * @returns {string}
 */
const evidenceText = (row, matches) => {
  if (row.status === "planned") {
    return row.where === "no ticket yet"
      ? "planned, with no ticket yet"
      : `planned; the ticket is ${row.where}`;
  }

  if (row.status === "dropped") {
    return "not carried over; the where column gives the reason";
  }

  const parts = matches.map((match) => {
    const screen = screenById.get(match.screen);

    return `screen ${screen.route} (${screen.step}): ${match.note}`;
  });

  return parts.length === 0
    ? "built in code; no screen in the browser drive shows it"
    : parts.join("; ");
};

/**
 * @param {DriveStep} step
 * @param {EvidenceRun | null} run
 * @returns {string}
 */
const recordText = (step, run) => {
  if (step.artifact === null) {
    return "no record declared";
  }

  if (!exists(path.join(run?.folder ?? "", step.artifact))) {
    return `record ${step.artifact} is not in any evidence folder`;
  }

  return `record ${step.artifact} in ${run.entry}`;
};

/**
 * @param {{ behaviour: string, place: string, status: string, where: string }} row
 * @param {string[]} drives
 * @returns {string}
 */
const driveCell = (row, drives) => {
  if (row.status !== "built") {
    return `<p class="none">No drive step: this row is ${escapeHtml(row.status)}.</p>`;
  }

  if (drives.length === 0) {
    return `<p class="none">No drive step covers this row: step-table.json names no step for ${escapeHtml(row.where)}.</p>`;
  }

  const items = drives.map((id) => {
    const step = stepById.get(id);
    const run = stepRunOf(id);

    const record = recordText(step, run);

    const pages = [
      ...new Set(
        refsOf(row.where)
          .filter((reference) =>
            (driveSteps.get(reference.capability) ?? []).includes(id)
          )
          .map((reference) => capabilityPage.get(reference.capability))
          .filter((title) => title !== undefined)
      ),
    ];

    return `<li><code>${escapeHtml(id)}</code> drive<br><span>${escapeHtml(record)}${pages.length === 0 ? "" : `, ${escapeHtml(pages.join(", "))} page`}</span></li>`;
  });

  return `<ul class="drives">${items.join("")}</ul>`;
};

/**
 * @param {string} screenId
 * @returns {string}
 */
const screenCell = (screenId) => {
  const oldShot = oldShotOf(screenId);
  const newShot = newShotOf(screenId);

  const screen = screenById.get(screenId);

  const oldSide =
    oldShot === null
      ? `<div class="missing"><strong>Old screenshot missing</strong><p>${escapeHtml(screen.oldGap ?? oldReason)}</p></div>`
      : `<figure><img src="${imageSource(oldShot)}" alt="Old app, ${escapeHtml(screenId)}"><figcaption>old app, ${escapeHtml(screen.oldRoute ?? screen.route)}; click to enlarge</figcaption></figure>`;

  const newSide =
    newShot === null
      ? `<div class="missing"><strong>New screenshot missing</strong><p>The evidence folder holds no web-${escapeHtml(screenId)}.png.</p></div>`
      : `<figure><img src="${imageSource(newShot)}" alt="New app, ${escapeHtml(screenId)}"><figcaption>new app, ${escapeHtml(screenById.get(screenId).route)}, from web-${escapeHtml(screenId)}.png; click to enlarge</figcaption></figure>`;

  return `<div class="pair">${oldSide}${newSide}</div>`;
};

const rowsHtml = report
  .map((entry) => {
    const { row } = entry;
    const screenIds = [...new Set(entry.matches.map((match) => match.screen))];

    const pairCell =
      screenIds.length === 0
        ? `<p class="none">${escapeHtml(noPairText(row.status))}</p>`
        : screenIds.map((screenId) => screenCell(screenId)).join("");

    return `<tr>
  <td><p class="behaviour">${escapeHtml(row.behaviour)}</p><p class="place">${escapeHtml(row.place)}</p></td>
  <td>${escapeHtml(row.where)}</td>
  <td><span class="status ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span><p class="evidence">${escapeHtml(evidenceText(row, entry.matches))}</p></td>
  <td>${driveCell(row, entry.drives)}</td>
  <td>${pairCell}</td>
</tr>`;
  })
  .join("\n");

const screenSections = screens
  .map((screen) => {
    const run = shotRunOf(screen.id);
    const checks = checksOf(run, screen.step);
    const shot = newShotOf(screen.id);

    const observed = checks
      .map(
        (check) =>
          `<tr><td><code>${escapeHtml(check.id)}</code></td><td>${escapeHtml(check.expected)}</td><td>${escapeHtml(check.actual)}</td><td>${check.passed ? "yes" : "no"}</td></tr>`
      )
      .join("\n");

    return `<section class="screen">
  <h3>${escapeHtml(screen.id)} at <code>${escapeHtml(screen.route)}</code></h3>
  <p>${screen.gap === undefined ? `Built parity rows this screen shows: ${screenPairCount(screen.id)}.` : escapeHtml(screen.gap)}</p>
  ${shot === null ? "" : `<figure class="wide"><img src="${imageSource(shot)}" alt="New app, ${escapeHtml(screen.id)}"><figcaption>new app, ${escapeHtml(screen.route)}, from ${escapeHtml(run.entry)}/web-${escapeHtml(screen.id)}.png; click to enlarge</figcaption></figure>`}
  <table class="checks"><thead><tr><th>Observation</th><th>Expected</th><th>Observed</th><th>Passed</th></tr></thead><tbody>${observed}</tbody></table>
</section>`;
  })
  .join("\n");

const counts = {
  built: statusCount("built"),
  driven: report.filter(
    (entry) => entry.row.status === "built" && entry.drives.length > 0
  ).length,
  dropped: statusCount("dropped"),
  oldMissing: oldMissing.length,
  pair: withPair.length,
  planned: statusCount("planned"),
  rows: report.length,
  screenshots: withNewShot.length,
};

counts.undriven = counts.built - counts.driven;

const runLine = (run) =>
  `${path.relative(REPO_ROOT, run.folder)} run ${run.proof.ranAt ?? "unknown"} on ${run.proof.branch ?? "unknown"} at ${(run.proof.commit ?? "unknown").slice(0, 8)}, ${run.proof.checks.filter((check) => check.passed).length} of ${run.proof.checks.length} observations passed`;

const usedRuns = runs.filter(
  (run) =>
    screens.some((screen) => shotRunOf(screen.id)?.folder === run.folder) ||
    stepTable.steps.some((step) => stepRunOf(step.id)?.folder === run.folder)
);

const evidenceLine =
  usedRuns.length === 0
    ? "no evidence folder holds a proof.json yet"
    : usedRuns.map(runLine).join("; ");

const observedTotal = screens.reduce(
  (sum, screen) => sum + checksOf(shotRunOf(screen.id), screen.step).length,
  0
);

const gapScreens = screens.filter((screen) => screen.gap !== undefined).length;

const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>Pecunia side by side: every old feature</title>
<style>
:root { --ink: #16161a; --soft: #6b6b76; --line: #d8d8de; --accent: #ff1493; }
* { box-sizing: border-box; }
body { margin: 0 auto; padding: 2rem 1.5rem 4rem; max-width: 1500px; color: var(--ink); background: #fff;
  font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
h1 { font-size: 1.9rem; margin: 0 0 0.4rem; letter-spacing: -0.02em; }
h2 { font-size: 1.2rem; margin: 2.4rem 0 0.6rem; padding-top: 1rem; border-top: 1px solid var(--line); }
h3 { font-size: 1rem; margin: 0 0 0.3rem; }
p { margin: 0 0 0.5rem; }
.lede { color: var(--soft); max-width: 78ch; }
.figures { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1.2rem 0 0; padding: 0; list-style: none; }
.figures li { border: 1px solid var(--line); border-radius: 6px; padding: 0.6rem 0.9rem; min-width: 9rem; }
.figures b { display: block; font-size: 1.5rem; letter-spacing: -0.02em; }
.figures span { color: var(--soft); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; vertical-align: top; padding: 0.6rem 0.5rem; border-bottom: 1px solid var(--line); }
th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--soft); }
.behaviour { margin: 0; font-weight: 600; }
.place { margin: 0; color: var(--soft); font-size: 0.82rem; }
.evidence { margin: 0.3rem 0 0; color: var(--soft); font-size: 0.82rem; max-width: 46ch; }
.drives { margin: 0; padding: 0; list-style: none; font-size: 0.82rem; }
.drives li { margin-bottom: 0.35rem; }
.drives span { color: var(--soft); }
.status { display: inline-block; border-radius: 999px; padding: 0.1rem 0.55rem; font-size: 0.78rem; font-weight: 600; }
.status.built { background: #e6f6ec; color: #14603a; }
.status.planned { background: #fff4dd; color: #6d4b06; }
.status.dropped { background: #efeef2; color: #4b4b57; }
.pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; margin-bottom: 0.6rem; max-width: 720px; }
.pair figure, .pair .missing { min-width: 0; }
figure { margin: 0; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
figure img { display: block; width: 100%; height: 240px; object-fit: contain; object-position: top left; background: #f7f7fa; cursor: zoom-in; }
figure.wide img { height: 620px; }
figure.zoomed img { height: auto; max-height: none; object-fit: fill; cursor: zoom-out; }
figure figcaption { padding: 0.3rem 0.5rem; font-size: 0.78rem; color: var(--soft); border-top: 1px solid var(--line); }
.missing { border: 1px dashed var(--accent); border-radius: 6px; padding: 0.6rem; font-size: 0.8rem; }
.missing strong { display: block; margin-bottom: 0.2rem; }
.none { color: var(--soft); font-size: 0.82rem; font-style: italic; }
.checks { margin-top: 0.6rem; font-size: 0.85rem; }
.checks td { font-variant-numeric: tabular-nums; }
.screen { margin-bottom: 1.6rem; }
code { font: 0.85em ui-monospace, SFMono-Regular, Menlo, monospace; background: #f4f4f7; padding: 0.05rem 0.25rem; border-radius: 3px; }
.limits li { margin-bottom: 0.35rem; }
</style>
</head>
<body>
<h1>Every feature of the old app, side by side</h1>
<p class="lede">One row per behaviour the old private app had, taken from the parity page, against what this repository does today. The old side of each pair is a local run of the old code with a made-up demo book. The new side is the browser drive of this branch, in headless Chromium with real clicks.</p>

<ul class="figures">
  <li><b>${counts.rows}</b><span>old features</span></li>
  <li><b>${counts.built}</b><span>built</span></li>
  <li><b>${counts.planned}</b><span>planned</span></li>
  <li><b>${counts.dropped}</b><span>dropped</span></li>
  <li><b>${counts.screenshots}</b><span>built rows with a new screenshot</span></li>
  <li><b>${counts.pair}</b><span>built rows with a pair</span></li>
  <li><b>${counts.driven}</b><span>built rows with a drive step</span></li>
  <li><b>${counts.undriven}</b><span>built rows with no drive step</span></li>
  <li><b>${counts.oldMissing}</b><span>old screenshot missing</span></li>
</ul>

<h2>Where this comes from</h2>
<ul>
  <li>Parity rows: <code>${escapeHtml(path.relative(REPO_ROOT, PAGE_FILE))}</code>, ${counts.rows} behaviour rows.</li>
  <li>Web evidence, newest folder per screen: ${escapeHtml(evidenceLine)}.</li>
  <li>Drive steps: <code>.claude/skills/verify-pecunia/scripts/step-table.json</code>, and the feature page each capability belongs to in <code>.claude/skills/verify-pecunia/features/</code>.</li>
  <li>Old side: ${escapeHtml(OLD_SIDE_NOTE)}</li>
</ul>

<h2>The rows</h2>
<table>
<thead><tr><th style="width:22%">Old behaviour</th><th style="width:15%">Where it was</th><th style="width:22%">Status and what backs it</th><th style="width:18%">Drive step</th><th style="width:23%">Screenshot pair</th></tr></thead>
<tbody>
${rowsHtml}
</tbody>
</table>

<h2>What the browser drive observed</h2>
<p class="lede">Every observation below was read off a page in headless Chromium after a real click, against a build of the branch that ran it. ${screens.length} screens, ${observedTotal} observations. The ${gapScreens === 1 ? "one gap is" : `${gapScreens} gaps are`} recorded as gaps, not hidden.</p>
${screenSections}

<h2>What this report does not prove</h2>
<ul class="limits">
  <li>A new-app screenshot proves the layout and the words on a screen. It does not prove a sum: the screens draw client fixtures, so a number on one is not the demo book's number.</li>
  <li>No old screenshot exists unless the old app ran locally. Where it is missing the row says so rather than showing a stand-in.</li>
  <li>A planned row has no user surface in either app, so there is nothing to photograph. The where column names its ticket or says no ticket yet.</li>
  <li>A dropped row will not be carried over. The where column gives the reason in plain words.</li>
  <li>The command that produced this page is <code>node .claude/skills/verify-pecunia/scripts/build-side-by-side.mjs</code>. It writes here, never into the repository.</li>
</ul>
</body>
<script>
for (const figure of document.querySelectorAll("figure")) {
  figure.addEventListener("click", () => figure.classList.toggle("zoomed"));
}
</script>
</html>
`;

mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });

writeFileSync(OUTPUT_FILE, html);

process.stdout.write(
  `SUMMARY rows=${counts.rows} built=${counts.built} driven=${counts.driven} undriven=${counts.undriven} planned=${counts.planned} dropped=${counts.dropped} newScreenshots=${counts.screenshots} pairs=${counts.pair} oldMissing=${counts.oldMissing} evidence=${usedRuns.length === 0 ? "none" : usedRuns.map((run) => run.entry).join(",")} written=${OUTPUT_FILE}\n`
);
