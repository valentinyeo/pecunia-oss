import { describe, expect, it } from "vitest";

import { findPersonalData } from "./check-no-personal-data.ts";
import type { AllowList } from "./check-no-personal-data.ts";

const empty: AllowList = { generated: [], values: [] };

const withValues = (
  entries: readonly { readonly reason: string; readonly value: string }[]
): AllowList => ({ generated: [], values: entries });

const ruleOf = (
  filePath: string,
  text: string,
  allow: AllowList = empty
): readonly string[] =>
  findPersonalData(filePath, text, allow).map((finding) => finding.rule);

const lineOf = (filePath: string, text: string, allow: AllowList = empty) =>
  findPersonalData(filePath, text, allow).map((finding) => finding.line);

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

  it("passes on an account id that is not in a config file", () => {
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
      ruleOf("apps/cli/src/bank.ts", 'const sortCode = "00-00-00";')
    ).toEqual([]);
  });
});

describe("explicit allowances pass", () => {
  it("passes on a value the allow list names with a reason", () => {
    const allow = withValues([
      {
        reason: "Planted sample in the guard's own test.",
        value: "GB00DEMO12345678901234",
      },
    ]);

    expect(
      ruleOf(
        "scripts/sample.ts",
        'const iban = "GB00DEMO12345678901234";',
        allow
      )
    ).toEqual([]);
  });

  it("fails on the same rule when the value is not the allowed one", () => {
    const allow = withValues([
      {
        reason: "Planted sample in the guard's own test.",
        value: "GB00DEMO12345678901234",
      },
    ]);

    expect(
      ruleOf(
        "scripts/sample.ts",
        `const iban = "${"GB00DEMO12345678901234".replace("DEMO", "OTHR")}";`,
        allow
      )
    ).toEqual(["iban"]);
  });

  it("passes on a generated file the allow list names with a reason", () => {
    const allow: AllowList = {
      generated: [
        { path: "pnpm-lock.yaml", reason: "pnpm writes this lockfile." },
      ],
      values: [],
    };

    expect(
      ruleOf("pnpm-lock.yaml", 'resolution: "GB00DEMO12345678901234"', allow)
    ).toEqual([]);
  });
});
