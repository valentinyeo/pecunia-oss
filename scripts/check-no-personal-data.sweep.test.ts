// @effect-diagnostics nodeBuiltinImport:off -- The sweep runs the guard over the tracked tree through Git and reads each file from disk.
import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findPersonalData } from "./check-no-personal-data.ts";
import type { AllowList } from "./check-no-personal-data.ts";

const root = path.resolve(import.meta.dirname, "..");

const empty: AllowList = { skipped: [], values: [] };

interface Random {
  readonly between: (low: number, high: number) => number;
  readonly digits: (count: number) => string;
  readonly pick: <T>(items: readonly T[]) => T;
}

const makeRandom = (seed: number): Random => {
  let state = seed;

  const advance = () => {
    state = (state * 48_271) % 2_147_483_647;

    return (state - 1) / 2_147_483_646;
  };

  const between = (low: number, high: number) => {
    const value = low + Math.floor(advance() * (high - low + 1));

    return Math.min(value, high);
  };

  const pick = <T>(items: readonly T[]): T => {
    const item = items[between(0, items.length - 1)];

    if (item === undefined) {
      throw new Error("picked from an empty list");
    }

    return item;
  };

  return {
    between,
    digits: (count) => {
      let text = "";

      for (let index = 0; index < count; index += 1) {
        text += String(between(0, 9));
      }

      return text;
    },
    pick,
  };
};

const SWEEP_SEED = 20_260_241;

const SWEEP_CASES = 200;

const DESCRIPTIONS = [
  "Demo Coffee",
  "Invoice payment from Example Ltd",
  "Demo subscription",
  "Example Fuel",
  "Demo groceries",
];

const CURRENCIES = ["EUR", "GBP", "USD"];

const DATES = ["2026-01-06", "2026-01-12", "2025-12-31", "2024-07-04"];

const AMOUNTS = [4250, 480_000, 116_100, 328_955, 299_000, 358_800];

const REFERENCES = [
  "DEMO-2026-0001",
  "DEMO-2025-0004",
  "",
  "demo-transfer",
  "EXAMPLE-2026-0007",
];

const HEX = "0123456789abcdef";

const fingerprint = (random: Random) => {
  let text = "csv-";

  for (let index = 0; index < 64; index += 1) {
    text += HEX.charAt(random.between(0, HEX.length - 1));
  }

  return text;
};

const row = (random: Random) => ({
  amountMinor: random.pick(AMOUNTS),
  currency: random.pick(CURRENCIES),
  date: random.pick(DATES),
  description: random.pick(DESCRIPTIONS),
  fingerprint: fingerprint(random),
  reference: random.pick(REFERENCES),
});

const jsonFixture = (random: Random) => {
  const rows = Array.from({ length: random.between(1, 4) }, () => row(random));

  return random.between(0, 1) === 0
    ? JSON.stringify(
        { demoLines: rows, reviewMarks: { tag: "Reviewed" } },
        null,
        2
      )
    : JSON.stringify({ demoLines: rows, reviewMarks: { tag: "Reviewed" } });
};

const csvFixture = (random: Random) => {
  const header = "date,description,amount_minor,currency,reference";

  const rows = Array.from({ length: random.between(1, 5) }, () => {
    const line = row(random);

    return [
      line.date,
      line.description,
      String(line.amountMinor),
      line.currency,
      line.reference,
    ].join(",");
  });

  return [header, ...rows].join("\n");
};

const TABLE_HEADERS = [
  "| Date | Description | Amount | Currency | Reference |",
  "| --- | --- | --- | --- | --- |",
];

const markdownFixture = (random: Random) => {
  const rows = Array.from({ length: random.between(1, 4) }, () => {
    const line = row(random);

    return [
      line.date,
      line.description,
      String(line.amountMinor),
      line.currency,
      line.reference,
    ].join(" | ");
  });

  return [...TABLE_HEADERS, ...rows].join("\n");
};

const INDEPENDENT_NUMBERS = [
  "| Date | Amount | Reference |",
  "| --- | --- | --- |",
  "| 20260106 | 480000 | 2026-0001 |",
  "| 20251231 | 328955 | 2025-0004 |",
  "| 2024-07-04 | 116100 | 0001-2026 |",
].join("\n");

const KINDS = [
  {
    build: jsonFixture,
    name: "json",
    path: "skills/verify-pecunia/scripts/step-table.json",
  },
  {
    build: csvFixture,
    name: "csv",
    path: "packages/bank-import/fixtures/demo-bank.csv",
  },
  {
    build: markdownFixture,
    name: "markdown table",
    path: "docs/demo-ledger.md",
  },
];

const rulesOf = (filePath: string, text: string) =>
  findPersonalData(filePath, text, empty).map((finding) => finding.rule);

describe("independent numbers never pair as a bank detail", () => {
  it(`keeps ${KINDS.length * SWEEP_CASES} seeded records of independent numbers quiet`, () => {
    const noisy: string[] = [];

    for (const [kind, fixture] of KINDS.entries()) {
      const random = makeRandom(SWEEP_SEED + kind);

      for (let index = 0; index < SWEEP_CASES; index += 1) {
        const text = fixture.build(random);

        const rules = rulesOf(fixture.path, text);

        if (rules.length > 0) {
          noisy.push(
            `seed ${SWEEP_SEED + kind} case ${index} ${fixture.name}: ${rules.join(",")}: ${text}`
          );
        }
      }
    }

    expect(noisy).toEqual([]);
  }, 120_000);

  it("keeps a table of independent numeric columns quiet", () => {
    expect(rulesOf("docs/demo-ledger.md", INDEPENDENT_NUMBERS)).toEqual([]);
  });

  it("keeps a JSON record quiet when an account key sits beside the numbers", () => {
    const text = [
      "{",
      '  "demoLines": [',
      "    {",
      '      "accountId": "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",',
      '      "amountMinor": 480000,',
      '      "date": "2026-01-06",',
      '      "reference": "DEMO-2026-0001"',
      "    }",
      "  ]",
      "}",
    ].join("\n");

    expect(
      rulesOf("skills/verify-pecunia/scripts/step-table.json", text)
    ).toEqual([]);
  });

  it("keeps a one-line JSON record quiet with independent keys", () => {
    const text =
      '{"accountId":"0192f0c1-0006-7b7b-8ffd-ffde623dd8df","amountMinor":480000,"date":"20260106","reference":"DEMO-2026-0001"}';

    expect(
      rulesOf("skills/verify-pecunia/scripts/step-table.json", text)
    ).toEqual([]);
  });

  it("still fails on a labelled pair in one record", () => {
    const text = [
      "{",
      '  "sortCode": "12-34-56",',
      '  "number": "12345678"',
      "}",
    ].join("\n");

    expect(rulesOf("apps/site/src/profile.ts", text)).toEqual(["bank-account"]);
  });

  it("still fails on a pair in one table row under bank column names", () => {
    const text = [
      "| Sort code | Account number |",
      "| --- | --- |",
      "| 12-34-56 | 12345678 |",
    ].join("\n");

    expect(rulesOf("docs/payments.md", text)).toEqual(["bank-account"]);
  });

  it("still fails on a pair in one CSV row under bank column names", () => {
    const text = [
      "sort_code,reference,account_number",
      "12-34-56,demo-transfer,12345678",
    ].join("\n");

    expect(rulesOf("packages/bank-import/fixtures/demo.csv", text)).toEqual([
      "bank-account",
    ]);
  });
});

describe("the guard stays quiet over the whole tracked tree", () => {
  it("reports no finding for any tracked file", () => {
    const run = spawnSync(
      process.execPath,
      [path.join(root, "scripts/check-no-personal-data.ts")],
      { cwd: root, encoding: "utf-8" }
    );

    expect({ status: run.status, stderr: run.stderr }).toEqual({
      status: 0,
      stderr: "",
    });

    expect(run.stdout).toContain("carry no personal data");
  }, 180_000);
});
