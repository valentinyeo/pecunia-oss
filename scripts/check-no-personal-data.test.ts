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

const spaced = (...parts: readonly string[]) => parts.join(" ");

const glued = (...parts: readonly string[]) => parts.join("");

const dotted = (...parts: readonly string[]) => parts.join(".");

const bankSample = (
  sortCode: string,
  parts: readonly string[],
  separator: string
) =>
  [
    "const account = {",
    `  sortCode: "${sortCode}",`,
    `  number: "${parts.join(separator)}",`,
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
    const sample = [
      "const account = {",
      '  sortCode: "00-00-00",',
      '  number: "12345678",',
      "};",
    ];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([
      "bank-account",
    ]);
  });

  it("fails on an email address outside the example domains", () => {
    expect(
      ruleOf(
        "apps/site/test/join.test.ts",
        'const owner = "jane.doe@acme.co.uk";'
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
  it.each([
    ["GB82", "WEST", "1234", "5698", "7654", "32"],
    ["DE89", "3704", "0044", "0532", "0130", "00"],
    ["FR14", "2004", "1010", "0505", "0001", "3M02", "606"],
    ["NL91", "ABNA", "0417", "1643", "00"],
    ["NO93", "8601", "1117", "947"],
    ["gb82", "west", "1234", "5698", "7654", "32"],
  ])("fails on %s", (...parts) => {
    expect(
      ruleOf("apps/cli/src/accounts.ts", `const iban = "${spaced(...parts)}";`)
    ).toEqual(["iban"]);
  });

  it.each([
    ["GB82WEST", "12345698765432"],
    ["gb82west", "12345698765432"],
    ["Gb82West", "12345698765432"],
  ])("fails on %s", (...parts) => {
    expect(
      ruleOf("apps/cli/src/accounts.ts", `const iban = "${glued(...parts)}";`)
    ).toEqual(["iban"]);
  });

  it("fails on a spaced IBAN inside a document", () => {
    expect(
      ruleOf(
        "docs/payments.md",
        `Wire to ${spaced("GB82", "WEST", "1234", "5698", "7654", "32")} before Friday.`
      )
    ).toEqual(["iban"]);
  });

  it("names the line the spaced IBAN sits on", () => {
    expect(
      lineOf(
        "docs/payments.md",
        `IBAN:\n\n${spaced("DE89", "3704", "0044", "0532", "0130", "00")}`
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
      ruleOf(
        "apps/cli/src/bank.ts",
        `const sortCode = "${spaced("20", "45", "67")}";`
      )
    ).toEqual([]);
  });
});

describe("a sort code and an account number in any written form fail", () => {
  it.each([
    ["-", ""],
    [" ", ""],
    [".", ""],
    ["–", ""],
    ["", ""],
    ["-", " "],
    ["-", "-"],
  ])(
    "fails on a sort code joined by %s with an account joined by %s",
    (sortCode, separator) => {
      expect(
        ruleOf(
          "apps/site/src/profile.ts",
          bankSample(
            glued("20", sortCode, "45", sortCode, "67"),
            ["1029", "3847"],
            separator
          )
        )
      ).toEqual(["bank-account"]);
    }
  );

  it("fails on the account number below a blank line", () => {
    const sample = [
      `sortCode: "${spaced("20", "45", "67")}",`,
      "",
      `number: "${glued("1029", "3847")}",`,
    ];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([
      "bank-account",
    ]);
  });

  it("fails on the account number above a blank line", () => {
    const sample = [
      `number: "${glued("1029", "3847")}",`,
      "",
      `sortCode: "${spaced("20", "45", "67")}",`,
    ];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([
      "bank-account",
    ]);
  });

  it("names the sort code line when the account number is two lines away", () => {
    const sample = [
      `const sortCode = "${spaced("20", "45", "67")}";`,
      "",
      `const number = "${glued("1029", "3847")}";`,
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
        value: spaced("00", "00", "00"),
      },
    ]);

    expect(
      ruleOf(
        "scripts/sample.ts",
        bankSample(spaced("00", "00", "00"), ["1234", "5678"], ""),
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
