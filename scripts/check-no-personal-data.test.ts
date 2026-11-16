import { describe, expect, it } from "vitest";

import { findPersonalData } from "./check-no-personal-data.ts";
import type { AllowList } from "./check-no-personal-data.ts";

const empty: AllowList = { skipped: [], values: [] };

const withValues = (
  entries: readonly {
    readonly path: string;
    readonly reason: string;
    readonly value: string;
  }[]
): AllowList => ({ skipped: [], values: entries });

const ruleOf = (
  filePath: string,
  text: string,
  allow: AllowList = empty
): readonly string[] =>
  findPersonalData(filePath, text, allow).map((finding) => finding.rule);

const lineOf = (filePath: string, text: string, allow: AllowList = empty) =>
  findPersonalData(filePath, text, allow).map((finding) => finding.line);

const testFile = "scripts/check-no-personal-data.test.ts";

const grouped = (value: string, separator: string) =>
  value.split("_").join(separator);

const iban = (separator: string) =>
  grouped("GB82_WEST_1234_5698_7654_32", separator);

const sortCode = (separator: string) => grouped("20_45_67", separator);

const accountNumber = (separator: string) => grouped("1029_3847", separator);

const dotted = (...parts: readonly string[]) => parts.join(".");

const bankSample = (sortCodeValue: string, accountValue: string) =>
  [
    "const account = {",
    `  sortCode: "${sortCodeValue}",`,
    `  number: "${accountValue}",`,
    "};",
  ].join("\n");

describe("planted personal data fails", () => {
  it("fails on an International Bank Account Number", () => {
    expect(
      ruleOf(
        "apps/cli/src/accounts.ts",
        'const iban = "GB00DEMO12345678901234";'
      )
    ).toEqual(["iban"]);
  });

  it("fails on an account number beside a sort code", () => {
    expect(
      ruleOf("apps/site/src/profile.ts", bankSample(sortCode("-"), "12345678"))
    ).toEqual(["bank-account"]);
  });

  it("fails on an email address outside the example domains", () => {
    expect(
      ruleOf(
        "apps/site/test/join.test.ts",
        'const owner = "jane.doe@acme.co.uk";'
      )
    ).toEqual(["email"]);
  });

  it("fails on a quoted mailbox with a space in its local part", () => {
    expect(
      ruleOf(
        "docs/payments.md",
        `Reply to "demo owner"@${dotted("mail", "co", "uk")} before Friday.`
      )
    ).toEqual(["email"]);
  });

  it("fails on a Cloudflare account id inside a config file", () => {
    expect(
      ruleOf(
        "apps/infra/wrangler.json",
        '{"account_id": "0123456789abcdef0123456789abcdef"}'
      )
    ).toEqual(["cloudflare-account-id"]);
  });

  it("fails on a deployment hostname on a Cloudflare domain", () => {
    expect(
      ruleOf("README.md", "Live at <https://planted-sample.workers.dev>.")
    ).toEqual(["cloudflare-hostname"]);
  });

  it("names the line it failed on", () => {
    expect(
      lineOf(
        "apps/cli/src/accounts.ts",
        'const empty = null;\nconst iban = "GB00DEMO12345678901234";'
      )
    ).toEqual([2]);
  });
});

describe("an IBAN in any written form fails", () => {
  it("fails on a spaced IBAN inside a document", () => {
    expect(
      ruleOf("docs/payments.md", `Wire to ${iban(" ")} before Friday.`)
    ).toEqual(["iban"]);
  });

  it("fails on a glued mixed case IBAN", () => {
    expect(
      ruleOf(
        "apps/cli/src/accounts.ts",
        `const iban = "${grouped("Gb82_West_1234_5698_7654_32", "")}";`
      )
    ).toEqual(["iban"]);
  });

  it("fails on an IBAN that wraps across a line break", () => {
    expect(ruleOf("docs/payments.md", `IBAN:\n${iban("\n")}`)).toEqual([
      "iban",
    ]);
  });

  it("names the line the spaced IBAN sits on", () => {
    expect(
      lineOf(
        "docs/payments.md",
        `IBAN:\n\n${grouped("DE89_3704_0044_0532_0130_00", " ")}`
      )
    ).toEqual([3]);
  });
});

describe("ordinary identifiers are not IBANs", () => {
  it.each([
    ["a four character code", 'const code = "at12";'],
    ["digits with prose around them", "the id is 12 and the total is 34"],
    [
      "a forty character commit sha",
      'const pin = "ab12cd34ef56789012345678901234567890123";',
    ],
    [
      "a thirty two character hex digest",
      'const digest = "0123456789abcdef0123456789abcdef";',
    ],
  ])("passes on %s", (_label, text) => {
    expect(ruleOf("apps/cli/src/notes.ts", text)).toEqual([]);
  });
});

describe("a deployment hostname fails in any case", () => {
  it.each([
    ["PECUNIA-PROBE", "WORKERS", "DEV"],
    ["PECUNIA-PROBE", "PAGES", "DEV"],
    ["PlantSample", "Workers", "Dev"],
    ["plant-sample", "cloudflareaccess", "com"],
  ])("fails on %s", (...label) => {
    expect(
      ruleOf("README.md", `Live at <https://${dotted(...label)}/health>.`)
    ).toEqual(["cloudflare-hostname"]);
  });

  it("still passes on the platform domain in any case", () => {
    expect(
      ruleOf("README.md", "Deploy targets *.WORKERS.DEV and *.Pages.Dev.")
    ).toEqual([]);
  });

  it("fails on a deployment hostname that wraps across a line break", () => {
    const hostname = dotted("planted-sample", "workers", "dev");

    expect(
      ruleOf(
        "README.md",
        `Live at <https://${hostname.slice(0, 7)}\n${hostname.slice(7)}>.`
      )
    ).toEqual(["cloudflare-hostname"]);
  });
});

describe("a Cloudflare account id fails wherever it names an account", () => {
  it("fails on an upper case id inside a config file", () => {
    expect(
      ruleOf(
        "apps/infra/wrangler.json",
        '{"account_id": "0123456789ABCDEF0123456789ABCDEF"}'
      )
    ).toEqual(["cloudflare-account-id"]);
  });

  it("fails on an id inside a Cloudflare dashboard URL", () => {
    expect(
      ruleOf(
        "README.md",
        "See https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/workers"
      )
    ).toEqual(["cloudflare-account-id"]);
  });

  it("fails on an id assigned to an account id in source", () => {
    expect(
      ruleOf(
        "apps/cli/src/ids.ts",
        'const accountId = "0123456789abcdef0123456789abcdef";'
      )
    ).toEqual(["cloudflare-account-id"]);
  });
});

describe("an email address fails in any written form", () => {
  it.each([
    ["an international domain", ["owner", "b\u00FCcher.de"].join("@")],
    [
      "an international local part",
      ["\u03B4\u03BF\u03BA\u03B9\u03BC\u03AE", "gmail.com"].join("@"),
    ],
    ["a quoted local part", ['"jane.doe"', "acme.co.uk"].join("@")],
  ])("fails on %s", (_label, address) => {
    expect(
      ruleOf("apps/site/test/fixture.ts", `const owner = "${address}";`)
    ).toEqual(["email"]);
  });
});

describe("a Cloudflare account id on the line after its name fails", () => {
  const id = "0123456789abcdef0123456789abcdef";

  it.each([
    ["above the value", `const accountId =\n  "${id}";`],
    [
      "above the value with a blank line between",
      `const accountId =\n\n  "${id}";`,
    ],
    [
      "two lines above a fallback value",
      `const accountId =\n  readAccount() ??\n  "${id}";`,
    ],
  ])("fails on an account id with its name %s", (_label, text) => {
    expect(ruleOf("apps/cli/src/ids.ts", text)).toEqual([
      "cloudflare-account-id",
    ]);
  });
});

describe("only the documented placeholder hosts are exempt", () => {
  it.each([
    ["a tenant label", "example.private-tenant.workers.dev"],
    ["a tenant label on pages", "example.private-tenant.pages.dev"],
    ["a deeper tenant", "example.example.workers.dev"],
  ])("fails on a real deployment host with %s", (_label, hostname) => {
    expect(
      ruleOf("README.md", `Live at <https://${hostname}/health>.`)
    ).toEqual(["cloudflare-hostname"]);
  });
});

describe("example values pass", () => {
  it.each([
    "demo@example.com",
    "demo@example.org",
    "demo@example.net",
    "developer@mail.example.test",
    "a.b+tag@unknown.invalid",
    "noreply@github.com",
    "noreply@anthropic.com",
    "1234+someone@users.noreply.github.com",
    '"jane.doe"@example.com',
    "bj\u00F6rn@example.com",
    "example.workers.dev",
    "example.pages.dev",
    "example.cloudflareaccess.com",
  ])("passes on %s", (value) => {
    expect(
      ruleOf("apps/site/test/fixture.ts", `const value = "${value}";`)
    ).toEqual([]);
  });

  it("passes on an account id that is not in a config file and not named as one", () => {
    expect(
      ruleOf(
        "apps/cli/src/ids.ts",
        'const id = "0123456789abcdef0123456789abcdef";'
      )
    ).toEqual([]);
  });

  it("passes on the platform domain without a deployment label", () => {
    expect(
      ruleOf("README.md", "Deploy targets *.workers.dev and *.pages.dev.")
    ).toEqual([]);
  });

  it("passes on a sort code without an account number", () => {
    expect(
      ruleOf("apps/cli/src/bank.ts", `const sortCode = "${sortCode(" ")}";`)
    ).toEqual([]);
  });
});

describe("a sort code and an account number in any written form fail", () => {
  it("fails on a bare pair joined by a space", () => {
    expect(
      ruleOf("docs/payments.md", `${sortCode("-")} ${accountNumber("")}`)
    ).toEqual(["bank-account"]);
  });

  it("fails on a pair inside a JSON object", () => {
    expect(
      ruleOf(
        "apps/site/src/profile.ts",
        `{"sortCode":${grouped("20_45_67", "")},"accountNumber":${grouped("1029_3847", "")}}`
      )
    ).toEqual(["bank-account"]);
  });

  it("fails on a sort code with a field between it and the account", () => {
    const sample = [
      "const account = {",
      `  sortCode: "${sortCode("-")}",`,
      '  currency: "GBP",',
      `  number: "${accountNumber("")}",`,
      "};",
    ];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([
      "bank-account",
    ]);
  });

  it("passes a sort code and account number from separate export records", () => {
    const firstRecord = [
      `sortCode: "${sortCode(" ")}",`,
      `bankName: "Demo Bank",`,
      `holder: "Demo Person",`,
      `currency: "GBP",`,
      `country: "GB",`,
      `opened: "2019-04-01",`,
      `note: "Everyday account for the demo household budget",`,
      `label: "Demo current account, opened at the demo branch",`,
      `branch: "Demo Branch, 1 Demo Street, Demotown, DE1 1AA",`,
      `reference: "demo-reference-for-the-first-export-record",`,
      `statement: "Demo statement for April, delivered to the demo mailbox",`,
    ];

    const secondRecord = [
      `bankName: "Example Bank",`,
      `holder: "Example Person",`,
      `currency: "GBP",`,
      `number: "${accountNumber("")}",`,
    ];

    const sample = [...firstRecord, ...secondRecord];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([]);
  });

  it("fails on the account number below a blank line", () => {
    const sample = [
      `sortCode: "${sortCode(" ")}",`,
      "",
      `number: "${accountNumber("")}",`,
    ];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([
      "bank-account",
    ]);
  });

  it("fails on the account number above a blank line", () => {
    const sample = [
      `number: "${accountNumber("")}",`,
      "",
      `sortCode: "${sortCode(" ")}",`,
    ];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([
      "bank-account",
    ]);
  });

  it("names the sort code line when the account number is two lines away", () => {
    const sample = [
      `const sortCode = "${sortCode(" ")}";`,
      "",
      `const number = "${accountNumber("")}";`,
    ];

    expect(lineOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([1]);
  });
});

describe("explicit allowances pass only in the file they name", () => {
  const allow = withValues([
    {
      path: testFile,
      reason: "Planted sample in the guard's own test.",
      value: "GB00DEMO12345678901234",
    },
  ]);

  it("passes on the value inside the file the allow list names", () => {
    expect(
      ruleOf(testFile, 'const iban = "GB00DEMO12345678901234";', allow)
    ).toEqual([]);
  });

  it("fails on the same value inside another file", () => {
    expect(
      ruleOf(
        "apps/cli/src/accounts.ts",
        'const iban = "GB00DEMO12345678901234";',
        allow
      )
    ).toEqual(["iban"]);
  });

  it("fails on the same rule when the value is not the allowed one", () => {
    expect(
      ruleOf(
        testFile,
        `const iban = "${"GB00DEMO12345678901234".replace("DEMO", "OTHR")}";`,
        allow
      )
    ).toEqual(["iban"]);
  });

  it("does not let an allowed sort code excuse the account number beside it", () => {
    const sortCodeAllow = withValues([
      {
        path: "scripts/sample.ts",
        reason: "A branch, not a person.",
        value: grouped("00_00_00", " "),
      },
    ]);

    expect(
      ruleOf(
        "scripts/sample.ts",
        bankSample(grouped("00_00_00", " "), grouped("1234_5678", "")),
        sortCodeAllow
      )
    ).toEqual(["bank-account"]);
  });

  it("passes on a file the allow list skips, with a reason", () => {
    const skipped: AllowList = {
      skipped: [
        { path: "pnpm-lock.yaml", reason: "pnpm writes this lockfile." },
      ],
      values: [],
    };

    expect(
      ruleOf("pnpm-lock.yaml", 'resolution: "GB00DEMO12345678901234"', skipped)
    ).toEqual([]);
  });
});
