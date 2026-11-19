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

const SORT_PARTS = ["12", "34", "56"];

const ACCOUNT_PARTS = ["1234", "5678"];

const plantedSortCode = SORT_PARTS.join("-");

const plantedAccount = ACCOUNT_PARTS.join("");

const spacerSortCode = ["20", "45", "67"].join("-");

const spacerAccount = ["1029", "3847"].join("");

const QUIET_CASES: readonly (readonly [string, string, string])[] = [
  [
    "a balance beside a ticket number",
    "docs/notes.md",
    "The account balance is 480000 and the ticket is 20260001.",
  ],

  [
    "an amount beside a dashed reference",
    "docs/notes.md",
    "Paid 480000 from the house account under reference 2026-0001.",
  ],

  [
    "an amount beside an order number",
    "docs/notes.md",
    "Order 480000 shipped from the account to invoice 12345678.",
  ],

  [
    "a year between two amounts",
    "docs/notes.md",
    "Account summary for 2026: 328955 in and 116100 out, reference 00042026.",
  ],

  [
    "a date and a compact date",
    "docs/notes.md",
    "Account opened 2026-01-06, first statement 20260106, total 4250.",
  ],

  [
    "a timestamp beside an amount",
    "docs/notes.md",
    "Account synced 2026-01-06T10:00:00Z with balance 480000.",
  ],

  [
    "a clock beside an amount",
    "docs/notes.md",
    "Account synced at 10:00:00 with balance 480000 and total 12345678.",
  ],

  [
    "a long fingerprint",
    "docs/notes.md",
    "Account export csv-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef with 480000 rows.",
  ],

  [
    "a short fingerprint",
    "docs/notes.md",
    "Account export digest 0123456789abcdef for 480000 rows and 12345678 cells.",
  ],

  [
    "a commit hash",
    "docs/notes.md",
    "Account sync commit a1b2c3d4e5f60718293a4b5c6d7e8f9012345678 moved 480000 rows.",
  ],

  [
    "a phone number beside a sort code word",
    "docs/notes.md",
    "Call the bank on +44 7700 900123 about the account balance of 480000.",
  ],

  [
    "a phone number beside an account word",
    "docs/notes.md",
    "Ring the account team on 07700 900456, ticket 20260001.",
  ],

  [
    "an amount in minor units in prose",
    "docs/notes.md",
    "The account total is 480000 minor units and the invoice is 328955.",
  ],

  [
    "two amounts on one line",
    "docs/notes.md",
    "The account shows 480000 earned and 116100 spent.",
  ],

  [
    "a sort code word with one number",
    "docs/notes.md",
    "Use sort code 204567 for this account.",
  ],

  [
    "an account number with no sort code",
    "docs/notes.md",
    "The account number is 12345678.",
  ],

  [
    "a year of invoices",
    "docs/notes.md",
    "Invoices 2024-0001 to 2024-0099 were paid from the account.",
  ],

  [
    "a version and a build number",
    "docs/notes.md",
    "Account module version 4.1.4 build 12345678 ships 480000 bytes.",
  ],

  ["a ledger of amounts", "docs/demo-ledger.md", INDEPENDENT_NUMBERS],

  [
    "a JSON record with an account key",
    "skills/verify-pecunia/scripts/step-table.json",
    [
      "{",
      '  "accountId": "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",',
      '  "amountMinor": 480000,',
      '  "date": "2026-01-06",',
      '  "reference": "DEMO-2026-0001"',
      "}",
    ].join("\n"),
  ],

  [
    "a one-line JSON record",
    "skills/verify-pecunia/scripts/step-table.json",
    '{"accountId":"0192f0c1-0006-7b7b-8ffd-ffde623dd8df","amountMinor":480000,"date":"20260106","reference":"DEMO-2026-0001"}',
  ],

  [
    "a CSV of amounts",
    "packages/bank-import/fixtures/demo.csv",
    [
      "date,description,amount_minor,currency,reference",
      "2026-01-06,Demo Coffee,480000,EUR,DEMO-2026-0001",
      "2026-01-12,Demo groceries,328955,GBP,DEMO-2025-0004",
    ].join("\n"),
  ],

  [
    "a table of amounts",
    "docs/demo-ledger.md",
    [
      "| Date | Description | Amount | Reference |",
      "| --- | --- | --- | --- |",
      "| 2026-01-06 | Demo Coffee | 480000 | 2026-0001 |",
      "| 2026-01-12 | Demo Fuel | 328955 | 2025-0004 |",
    ].join("\n"),
  ],

  [
    "a totals block",
    "docs/notes.md",
    [
      "account totals",
      "  january: 480000",
      "  february: 116100",
      "  year: 2026",
    ].join("\n"),
  ],

  [
    "a JSON escape of a date",
    "docs/notes.md",
    '{"account":"current","total":480000,"ticket":"20260001"}',
  ],

  [
    "a base64 checksum",
    "docs/notes.md",
    "account checksum Xk3Qw9Zt5Lb7Nc2Md4Pf6Rg8Sh1Vj0Wa3Ye5Ui7a used 480000 bytes",
  ],

  [
    "a hex colour list",
    "docs/notes.md",
    "account palette 012345 and 12345678 and 480000",
  ],

  [
    "an amount before a word with digits",
    "docs/notes.md",
    "The account 480000 sits beside plan2026 and tier12345678.",
  ],

  [
    "a quantity and a serial",
    "docs/notes.md",
    "Account stock quantity 480000, serial DEMO20260001.",
  ],

  [
    "a date and a time in a table",
    "docs/demo-ledger.md",
    [
      "| Account | Date | Amount |",
      "| --- | --- | --- |",
      "| current | 2026-01-06 | 480000 |",
      "| savings | 2026-01-12 | 116100 |",
    ].join("\n"),
  ],

  [
    "a sentence with a year and a rate",
    "docs/notes.md",
    "The account earned 480000 in 2026 at a rate of 328955 per year.",
  ],

  [
    "an invoice number with a year",
    "docs/notes.md",
    "Account invoice INV-2026-0001 was paid with 480000 from the review account.",
  ],

  [
    "an amount and an account word far apart",
    "docs/notes.md",
    "Account review for the demo household budget looked at 480000 and then at 12345678 later in the week.",
  ],

  [
    "a sort code word in the next paragraph",
    "docs/notes.md",
    [
      `The account holds ${spacerSortCode}.`,
      "",
      `Account review of ${spacerAccount}.`,
    ].join("\n"),
  ],

  [
    "two records split by a blank line",
    "apps/cli/demo.yaml",
    [
      `sort_code: ${spacerSortCode}`,
      "",
      `account_number: ${spacerAccount}`,
    ].join("\n"),
  ],

  [
    "two records under separate keys",
    "apps/cli/demo.yaml",
    [
      "first:",
      `  sort_code: ${spacerSortCode}`,
      "second:",
      `  account_number: ${spacerAccount}`,
    ].join("\n"),
  ],

  [
    "a date beside a year reference",
    "docs/notes.md",
    "Account statement 20260106 reference 2026-0001 total 480000.",
  ],

  [
    "a postal code and a budget",
    "docs/notes.md",
    "Account address DE1 1AA, budget 480000, review 20260001.",
  ],

  [
    "a duration and an amount",
    "docs/notes.md",
    "Account sync took 480000ms and returned 12345678 bytes.",
  ],

  [
    "a rate and a limit",
    "docs/notes.md",
    "Account rate 012345 accepted 12345678 requests.",
  ],

  [
    "a port and an id",
    "docs/notes.md",
    "Account service on port 480000 logged ticket 12345678.",
  ],

  [
    "a year range",
    "docs/notes.md",
    "Account history 2024-2026 covers 480000 rows in 12345678 cells.",
  ],

  [
    "an amount and a year number reference",
    "docs/notes.md",
    "Account transfer of 480000 under ticket 2026-0001.",
  ],

  [
    "a sort code with a separator word",
    "docs/notes.md",
    "Account sort 480000 and ticket 12345678.",
  ],

  [
    "a schema version and a count",
    "docs/notes.md",
    "Account schema v20260001 with 480000 rows.",
  ],

  [
    "a measurement list",
    "docs/notes.md",
    "account bytes 480000, cells 116100, rows 328955, tickets 20260001",
  ],

  [
    "an amount beside a masked number",
    "docs/notes.md",
    "Account number ****1234 total 480000 reference DEMO20260001.",
  ],

  [
    "a date range in prose",
    "docs/notes.md",
    "Account from 2026-01-06 to 2026-01-12 shows 480000 and 116100.",
  ],
];

const QUIET_SEED = 20_260_902;

const QUIET_SEEDED_CASES = 600;

const SPLIT_SEED = 20_260_903;

const SPLIT_CASES = 300;

const hexOf = (random: Random, count: number) => {
  let text = "";

  for (let index = 0; index < count; index += 1) {
    text += HEX.charAt(random.between(0, HEX.length - 1));
  }

  return text;
};

const QUIET_TEMPLATES: readonly ((random: Random) => string)[] = [
  (random) =>
    `The account balance is ${random.digits(6)} and the ticket is ${random.digits(8)}.`,
  (random) =>
    `Paid ${random.digits(6)} from the house account under reference ${random.digits(4)}-${random.digits(4)}.`,
  (random) =>
    `Order ${random.digits(8)} shipped from the account with invoice ${random.digits(6)}.`,
  (random) =>
    `Account statement ${random.between(1990, 2099)}-${String(random.between(1, 12)).padStart(2, "0")}-${String(random.between(1, 28)).padStart(2, "0")} total ${random.digits(6)}.`,
  (random) =>
    `Account statement compact ${random.between(1990, 2099)}${String(random.between(1, 12)).padStart(2, "0")}${String(random.between(1, 28)).padStart(2, "0")} total ${random.digits(6)}.`,
  (random) =>
    `Account export digest ${hexOf(random, 64)} covers ${random.digits(6)} rows.`,
  (random) =>
    `Account export commit ${hexOf(random, 40)} moves ${random.digits(6)} lines of ${random.digits(8)} cells.`,
  (random) =>
    `Account ticket ${random.digits(8)} was raised against the ${random.digits(6)} budget.`,
  (random) =>
    `Account palette ${random.digits(6)} with ${random.digits(4)}-${random.digits(4)} tiles.`,
  (random) =>
    `Account review of ${random.digits(6)} then, later in the week, of ${random.digits(8)}.`,
  (random) =>
    `Account bytes ${random.digits(6)}, cells ${random.digits(6)}, tickets ${random.digits(8)}.`,
  (random) =>
    `account_id ${random.digits(6)} ticket ${random.digits(4)}-${random.digits(4)}`,
];

const quietTemplate = (random: Random) => random.pick(QUIET_TEMPLATES)(random);

const SPLIT_SENTENCES: readonly ((random: Random) => string)[] = [
  (random) =>
    `The sort code to quote on the transfer is ${random.digits(2)}-${random.digits(2)}-${random.digits(2)}\n${random.digits(8)}`,
  (random) =>
    `Sort code for the standing order\n${random.digits(2)}-${random.digits(2)}-${random.digits(2)}\n${random.digits(8)}`,
  (random) =>
    `Sort code:\n${random.digits(2)} ${random.digits(2)} ${random.digits(2)}\n${random.digits(8)}`,
  (random) =>
    `Sort code for the rent is ${random.digits(2)}-${random.digits(2)}-${random.digits(2)}\n${random.digits(8)}`,
  (random) =>
    `sort-code\n${random.digits(2)}-${random.digits(2)}-${random.digits(2)}\r\n${random.digits(8)}`,
  (random) =>
    `The bank sort code is ${random.digits(2)}-${random.digits(2)}-${random.digits(2)},\n${random.digits(8)}`,
];

describe("a number near a bank word is not a bank pair", () => {
  it.each(QUIET_CASES)("keeps %s quiet", (_name, filePath, text) => {
    expect(rulesOf(filePath, text)).toEqual([]);
  });

  it(`keeps ${QUIET_SEEDED_CASES} seeded sentences and records quiet`, () => {
    const random = makeRandom(QUIET_SEED);

    const noisy: string[] = [];

    for (let index = 0; index < QUIET_SEEDED_CASES; index += 1) {
      const text = quietTemplate(random);

      const rules = rulesOf("docs/notes.md", text);

      if (rules.length > 0) {
        noisy.push(
          `seed ${QUIET_SEED} case ${index}: ${rules.join(",")}: ${text}`
        );
      }
    }

    expect(noisy).toEqual([]);
  });

  it(`reads ${SPLIT_CASES} seeded pairs whose label sits on the previous line`, () => {
    const random = makeRandom(SPLIT_SEED);

    const missed: string[] = [];

    for (let index = 0; index < SPLIT_CASES; index += 1) {
      const text = random.pick(SPLIT_SENTENCES)(random);

      const rules = rulesOf("docs/notes.md", text);

      if (!rules.includes("bank-account")) {
        missed.push(
          `seed ${SPLIT_SEED} case ${index}: ${JSON.stringify(rules)}: ${text}`
        );
      }
    }

    expect(missed).toEqual([]);
  });
});

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
      `  "sortCode": "${plantedSortCode}",`,
      `  "number": "${plantedAccount}"`,
      "}",
    ].join("\n");

    expect(rulesOf("apps/site/src/profile.ts", text)).toEqual(["bank-account"]);
  });

  it("still fails on a pair in one table row under bank column names", () => {
    const text = [
      "| Sort code | Account number |",
      "| --- | --- |",
      `| ${plantedSortCode} | ${plantedAccount} |`,
    ].join("\n");

    expect(rulesOf("docs/payments.md", text)).toEqual(["bank-account"]);
  });

  it("still fails on a pair in one CSV row under bank column names", () => {
    const text = [
      "sort_code,reference,account_number",
      `${plantedSortCode},demo-transfer,${plantedAccount}`,
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
