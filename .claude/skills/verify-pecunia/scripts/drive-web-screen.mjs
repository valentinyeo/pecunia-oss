#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import nodePath from "node:path";

import { withPage } from "./lib/browser.mjs";
import { observe } from "./lib/observation.mjs";

const fence = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

const argumentsOf = (argv) => {
  const values = new Map();

  for (let index = 0; index < argv.length; index += 2) {
    if (argv[index]?.startsWith("--") !== true) {
      fence(`drive-web-screen does not know the argument ${argv[index]}`);
    }

    values.set(argv[index].slice(2), argv[index + 1]);
  }

  return values;
};

const linesOf = (text) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const sectionOf = (lines, start, end) => {
  const from = lines.indexOf(start);

  if (from === -1) {
    return [];
  }

  const to = end === undefined ? lines.length : lines.indexOf(end, from + 1);

  return lines.slice(from + 1, to === -1 ? undefined : to);
};

const valueAfter = (lines, label) => {
  const index = lines.indexOf(label);

  return index === -1 ? "" : (lines[index + 1] ?? "");
};

const penceOf = (amount) => {
  const digits = amount.replaceAll(/[^0-9.]/gu, "");

  return digits === "" ? undefined : Math.round(Number(digits) * 100);
};

const mainText = async (page) =>
  linesOf(await page.locator("main").innerText());

const rowCount = (page) => page.locator("main ul li").count();

const waitForRows = async (page, count) => {
  await page.waitForFunction(
    (wanted) => document.querySelectorAll("main ul li").length === wanted,
    count,
    { timeout: 20_000 }
  );

  return rowCount(page);
};

const settle = (page) => page.waitForTimeout(400);

const tableRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("main table")].map((table) =>
      [...table.querySelectorAll("tr")].map((row) =>
        [...row.querySelectorAll("th, td")].map((cell) =>
          (cell.innerText ?? "").replaceAll(/\s+/gu, " ").trim()
        )
      )
    )
  );

const buttonNamed = (page, name) => page.getByRole("button", { name });

const screens = {
  aliases: {
    path: "/app/aliases",
    drive: async ({ page }) => {
      const tables = await tableRows(page);
      const aliases = tables[0]
        .slice(1)
        .filter((cells) => cells[1] !== "No aliases yet");
      const prefixed = aliases.some((cells) => cells[1].startsWith("prefix"));

      await buttonNamed(page, "New alias").click();
      await page
        .getByLabel("Text on the statement")
        .waitFor({ timeout: 20_000 });
      await settle(page);

      const form = await page.locator("main").innerText();

      return [
        observe({
          id: "web-aliases-lists-every-alias",
          value: `${aliases.length}`,
        }),
        observe({
          id: "web-aliases-shows-the-match-kind",
          value: prefixed ? "prefix" : "no prefix alias",
        }),
        observe({
          id: "web-aliases-new-alias-form-opens",
          value: form.includes("Text on the statement")
            ? "Text on the statement"
            : "no form",
        }),
      ];
    },
  },
  budgets: {
    path: "/app/budgets",
    drive: async ({ page }) => {
      await settle(page);

      const text = await page.locator("main").innerText();
      const line =
        linesOf(text).find((entry) => entry.includes("later slice")) ?? "";

      return [observe({ id: "web-budgets-is-a-later-slice", value: line })];
    },
  },
  categories: {
    path: "/app/categories",
    drive: async ({ page }) => {
      const tables = await tableRows(page);
      const before = await mainText(page);
      const heading = before.find((line) => line.startsWith("Spend in ")) ?? "";
      const firstRow = tables[0][1] ?? [];

      await page.selectOption("main select", "2026-01");
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("main h2")].some((heading) =>
            heading.innerText.includes("Jan 2026")
          ),
        { timeout: 20_000 }
      );
      await settle(page);

      const after = await mainText(page);
      const januaryHeading =
        after.find((line) => line.startsWith("Spend in ")) ?? "";
      const januaryTables = await tableRows(page);

      return [
        observe({
          id: "web-categories-spend-table",
          value: [heading, firstRow.join("; ")].join("; "),
        }),
        observe({
          id: "web-categories-month-picker",
          value: [januaryHeading, (januaryTables[0][1] ?? []).join("; ")].join(
            "; "
          ),
        }),
        observe({
          id: "web-categories-management-lists-every-category",
          value: `${(tables[1] ?? []).length - 1}`,
        }),
      ];
    },
  },
  dashboard: {
    path: "/app",
    drive: async ({ page }) => {
      await settle(page);

      const lines = await mainText(page);
      const netWorth = valueAfter(lines, "Net worth");
      const accountAmounts = sectionOf(lines, "Accounts").filter((line) =>
        line.startsWith("£")
      );
      const accountTotal = accountAmounts.reduce(
        (sum, amount) => sum + (penceOf(amount) ?? 0),
        0
      );
      const categories = sectionOf(
        lines,
        "Spend by category",
        "Balance, last twelve months"
      ).filter((_, index) => index % 2 === 0);

      return [
        observe({ id: "web-dashboard-net-worth", value: netWorth }),
        observe({
          id: "web-dashboard-net-worth-matches-accounts",
          value: `${penceOf(netWorth) === accountTotal}`,
        }),
        observe({
          id: "web-dashboard-spend-by-category",
          value: categories.join(","),
        }),
      ];
    },
  },
  investments: {
    path: "/app/investments",
    drive: async ({ page }) => {
      await settle(page);

      const lines = await mainText(page);
      const platforms = lines.filter((line) =>
        ["Generic Broker", "Generic Crypto Exchange"].includes(line)
      );
      const tables = await tableRows(page);
      const priced =
        tables.flat().find((cells) => cells[0]?.startsWith("Demo Bitcoin")) ??
        [];
      const priceless = tables
        .flat()
        .flatMap((cells) => cells)
        .filter((cell) => cell === "No price yet").length;

      return [
        observe({
          id: "web-investments-groups-holdings-by-platform",
          value: platforms.join(","),
        }),
        observe({
          id: "web-investments-shows-a-priceless-holding",
          value: `${priceless}`,
        }),
        observe({
          id: "web-investments-shows-value-and-gain",
          value: priced[4] ?? "",
        }),
      ];
    },
  },
  merchants: {
    path: "/app/merchants",
    drive: async ({ page }) => {
      const before = await mainText(page);
      const countOf = (lines) =>
        lines.find((line) => /^\d+ of \d+ merchants$/u.test(line)) ?? "";
      const tables = await tableRows(page);
      const grocer =
        tables[0].find((cells) => cells[0] === "Demo Grocer") ?? [];

      await page.selectOption("main select", { label: "No category yet" });
      await page.waitForFunction(
        () =>
          /^\d+ of \d+ merchants$/mu.test(
            document.querySelector("main").innerText
          ),
        { timeout: 20_000 }
      );
      await settle(page);

      const after = await mainText(page);
      const narrowed = countOf(after);

      return [
        observe({
          id: "web-merchants-lists-every-merchant",
          value: countOf(before),
        }),
        observe({
          id: "web-merchants-filter-narrows-the-list",
          value: narrowed === countOf(before) ? "unchanged" : narrowed,
        }),
        observe({
          id: "web-merchants-shows-count-and-total",
          value: [grocer[0], grocer[1], grocer[2]].join("; "),
        }),
      ];
    },
  },
  review: {
    path: "/app/review",
    drive: async ({ page }) => {
      const rows = await waitForRows(page, 5);

      await buttonNamed(page, "Suggest categories").click();
      await page.waitForFunction(
        () =>
          /suggestions are ready/u.test(
            document.querySelector("main").innerText
          ),
        { timeout: 20_000 }
      );
      await settle(page);

      const lines = await mainText(page);
      const ready =
        lines.find((line) => line.includes("suggestions are ready")) ?? "";

      return [
        observe({
          id: "web-review-lists-uncategorised-lines",
          value: `${rows}`,
        }),
        observe({ id: "web-review-suggests-categories", value: ready }),
      ];
    },
  },
  rules: {
    path: "/app/rules",
    drive: async ({ page }) => {
      const tables = await tableRows(page);
      const rules = tables[0].slice(1);
      const first = rules[0] ?? [];
      const chosen = await page.evaluate(() =>
        [...document.querySelectorAll("main table select")].map(
          (select) => select.selectedOptions[0]?.text ?? ""
        )
      );

      await buttonNamed(page, "New rule").click();
      await page.getByLabel("Least amount").waitFor({ timeout: 20_000 });
      await settle(page);

      const form = await page.locator("main").innerText();

      return [
        observe({ id: "web-rules-lists-every-rule", value: `${rules.length}` }),
        observe({
          id: "web-rules-shows-the-pattern",
          value: [first[0], first[1], chosen[0]].join("; "),
        }),
        observe({
          id: "web-rules-new-rule-form-opens",
          value: form.includes("Least amount") ? "Least amount" : "no form",
        }),
      ];
    },
  },
  search: {
    path: "/app/search",
    drive: async ({ page }) => {
      await page.getByLabel("Search everything").fill("Demo");
      await page.waitForFunction(
        () =>
          document.querySelectorAll('[aria-label="Suggestions"] li').length > 0,
        { timeout: 20_000 }
      );
      await settle(page);

      const suggestions = await page
        .locator('[aria-label="Suggestions"] li')
        .count();

      await buttonNamed(page, "Search").click();
      await page.waitForFunction(
        () => document.querySelectorAll("main h2").length > 0,
        { timeout: 20_000 }
      );
      await settle(page);

      const headings = await page.evaluate(() =>
        [...document.querySelectorAll("main h2")].map((heading) =>
          heading.innerText.trim()
        )
      );
      const payments = await page.locator('[aria-label="Payments"] li').count();

      return [
        observe({
          id: "web-search-suggests-while-typing",
          value: `${suggestions}`,
        }),
        observe({
          id: "web-search-finds-payments-and-holdings",
          value: [headings.join(","), `${payments}`].join("; "),
        }),
      ];
    },
  },
  settings: {
    path: "/app/settings",
    drive: async ({ page }) => {
      await page.getByLabel("Base currency").waitFor({ timeout: 20_000 });
      await settle(page);

      const values = await page.evaluate(() =>
        ["settings-base-currency", "settings-locale", "settings-timezone"].map(
          (name) => document.querySelector(`[name="${name}"]`)?.value ?? ""
        )
      );
      const profiles = await page.evaluate(() =>
        [...document.querySelectorAll("main ul li")].map((entry) =>
          entry.innerText.split("\n")[0].trim()
        )
      );

      return [
        observe({
          id: "web-settings-shows-the-demo-values",
          value: values.join("; "),
        }),
        observe({
          id: "web-settings-lists-the-profiles",
          value: profiles.join(","),
        }),
      ];
    },
  },
  subscriptions: {
    path: "/app/subscriptions",
    drive: async ({ consoleErrors, page }) => {
      await page.waitForFunction(
        () => document.body.innerText.includes("Application Crash"),
        { timeout: 20_000 }
      );
      await settle(page);

      const failure = consoleErrors.find((entry) =>
        entry.includes("Service not found")
      );
      const reason = /Service not found: (?<service>[^\s]+)/u.exec(
        failure ?? ""
      );

      return [
        observe({
          id: "web-subscriptions-fails-to-load",
          value:
            reason === null
              ? "the screen did not report a missing service"
              : `Service not found: ${reason.groups.service}`,
        }),
      ];
    },
  },
  transactions: {
    path: "/app/transactions",
    drive: async ({ page }) => {
      const listed = await waitForRows(page, 12);

      await page.getByLabel("Search bank lines").fill("Demo Coffee");
      const searched = await waitForRows(page, 2);

      await page.getByLabel("Search bank lines").fill("");
      await waitForRows(page, 12);

      await page.locator("main ul li a").first().click();
      await page.waitForURL(/\/app\/spending\/category\//u);
      await page.waitForLoadState("networkidle");
      await settle(page);

      const path = new URL(page.url()).pathname;
      const filtered = await rowCount(page);

      await page.goto(`${page.url().split("/app/")[0]}/app/transactions`, {
        timeout: 60_000,
        waitUntil: "networkidle",
      });
      await waitForRows(page, 12);

      await page.locator("main ul li button").first().click();
      await page.getByLabel("Note").waitFor({ timeout: 20_000 });
      await settle(page);

      const form = await page.evaluate(() =>
        [
          ...document
            .querySelectorAll("main ul li")[0]
            .querySelectorAll("label"),
        ].map((label) => label.innerText.trim())
      );
      const save = await page
        .getByRole("button", { name: "Save line" })
        .count();

      return [
        observe({
          id: "web-transactions-lists-every-demo-line",
          value: `${listed}`,
        }),
        observe({
          id: "web-transactions-search-narrows-the-list",
          value: `Demo Coffee; ${searched}`,
        }),
        observe({
          id: "web-transactions-category-link-filters-the-list",
          value: `${filtered}`,
        }),
        observe({
          id: "web-transactions-category-link-is-its-own-url",
          value: `${path.startsWith("/app/spending/category/")}`,
        }),
        observe({
          id: "web-transactions-edit-form-opens",
          value: save > 0 ? form.join(",") : "no edit form",
        }),
      ];
    },
  },
};

const values = argumentsOf(process.argv.slice(2));

const name =
  values.get("screen") ?? fence("drive-web-screen needs --screen <name>");

const chosen = screens[name];

if (chosen === undefined) {
  fence(
    `drive-web-screen does not know the screen ${name}. Fix: pass one of ${Object.keys(screens).join(", ")}.`
  );
}

const baseUrl = values.get("base-url") ?? "http://127.0.0.1:4321";

const screenshot = values.get("screenshot");

const run = async () => {
  const { observations } = await withPage(
    { baseUrl, path: chosen.path },
    async ({ consoleErrors, page }) => {
      const result = {
        observations: await chosen.drive({ consoleErrors, page }),
      };

      if (screenshot !== undefined) {
        mkdirSync(nodePath.dirname(screenshot), { recursive: true });
        await page.screenshot({ fullPage: true, path: screenshot });
      }

      return result;
    }
  );

  return {
    baseUrl,
    observations,
    screen: name,
    url: `${baseUrl}${chosen.path}`,
  };
};

try {
  const result = await run();

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stdout.write(
    `${JSON.stringify(
      { observations: [], screen: name, url: `${baseUrl}${chosen.path}` },
      null,
      2
    )}\n`
  );
  process.stderr.write(
    `drive-web-screen could not drive ${name}: ${error.message}\n`
  );
  process.exit(1);
}
