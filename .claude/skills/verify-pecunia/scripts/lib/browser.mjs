import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import nodePath from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

const fence = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

const candidatePaths = () => {
  const paths = [];

  try {
    paths.push(require.resolve("playwright"));
  } catch {
    paths.push(undefined);
  }

  try {
    const globalRoot = execFileSync("npm", ["root", "-g"], {
      encoding: "utf-8",
    }).trim();

    paths.push(nodePath.join(globalRoot, "playwright", "index.mjs"));
  } catch {
    paths.push(undefined);
  }

  return paths.filter((entry) => typeof entry === "string");
};

export const loadPlaywright = async () => {
  for (const candidate of candidatePaths()) {
    if (existsSync(candidate) === false) {
      continue;
    }

    try {
      return await import(pathToFileURL(candidate).href);
    } catch {
      continue;
    }
  }

  return fence(
    "Playwright is not installed, so no browser can drive a screen. Fix: run `npm install -g playwright` then `npx playwright install chromium`."
  );
};

export const withPage = async ({ baseUrl, path, viewport }, body) => {
  const { chromium } = await loadPlaywright();

  const browser = await chromium.launch();

  try {
    const context = await browser.newContext({
      viewport: viewport ?? { width: 1440, height: 1200 },
    });

    const page = await context.newPage();

    const consoleErrors = [];

    page.on("pageerror", (error) => {
      consoleErrors.push(`pageerror ${String(error)}`);
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(`console ${message.text()}`);
      }
    });

    await page.goto(`${baseUrl}${path}`, {
      timeout: 60_000,
      waitUntil: "networkidle",
    });

    await page.waitForSelector("body", { timeout: 30_000 });

    const result = await body({ consoleErrors, page });

    return { consoleErrors, ...result };
  } finally {
    await browser.close();
  }
};
