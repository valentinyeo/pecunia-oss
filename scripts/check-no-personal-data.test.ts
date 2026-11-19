import { describe, expect, it } from "vitest";

import {
  findPersonalData,
  GUARD_RULES,
  PERSONAL_DATA_MATRIX,
  RULE_IDS,
  VIEW_IDS,
} from "./check-no-personal-data.ts";
import type { AllowList } from "./check-no-personal-data.ts";
import { DECODERS, decodeChains } from "./decoded-text.ts";

const empty: AllowList = { skipped: [], values: [] };

const withValues = (
  entries: readonly {
    readonly column?: string;
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

const grouped = (parts: readonly string[], separator: string) =>
  parts.join(separator);

const sortCode = (separator: string) => grouped(["20", "45", "67"], separator);

const accountNumber = (separator: string) =>
  grouped(["1029", "3847"], separator);

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
        'const iban = "GB82WEST12345698765432";'
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
        'const empty = null;\nconst iban = "GB82WEST12345698765432";'
      )
    ).toEqual([2]);
  });
});

describe("a leak the verifier wrote by hand is reported", () => {
  const planted = "Xk3Qw9Zt5Lb7Nc2Md4Pf6Rg8Sh1Vj0Wa3Ye5Ui7a";

  it("reads a mailbox inside a percent-encoded contact link", () => {
    expect(
      ruleOf(
        "docs/payments.md",
        '<a href="mailto:demo.person%40mailhost.co.uk">contact</a>'
      )
    ).toEqual(["email"]);
  });

  it("reads an IBAN written as a form field with plus signs", () => {
    expect(
      ruleOf("docs/payments.md", "iban=GB82+WEST+1234+5698+7654+32")
    ).toEqual(["iban"]);
  });

  it("reads bank details written as form fields with plus signs", () => {
    expect(
      ruleOf("docs/payments.md", "sort_code=23+45+67&account_number=98765432")
    ).toEqual(["bank-account"]);
  });

  it("reads an IBAN split by a multiline tag with an attribute", () => {
    expect(
      ruleOf(
        "docs/payments.md",
        'GB82 WEST 1234<br\n class="bank">5698 7654 32'
      )
    ).toEqual(["iban"]);
  });

  it("reads a block scalar under a quoted YAML key", () => {
    expect(
      ruleOf(
        "apps/infra/wrangler.yaml",
        `"CLOUDFLARE_API_TOKEN": |-\n  ${planted}`
      )
    ).toEqual(["secret-block-scalar"]);
  });

  it("reads a block scalar under a commented key with an indentation indicator", () => {
    expect(
      ruleOf(
        "apps/infra/wrangler.yaml",
        `CLOUDFLARE_API_TOKEN: |2- # demo\n  ${planted}`
      )
    ).toEqual(["secret-block-scalar"]);
  });
});

describe("an IBAN fails in any written form", () => {
  it("names the line the spaced IBAN sits on", () => {
    expect(
      lineOf(
        "docs/payments.md",
        `IBAN:\n\n${grouped(["DE89", "3704", "0044", "0532", "0130", "00"], " ")}`
      )
    ).toEqual([3]);
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

describe("a block scalar value below its key fails", () => {
  const planted = "Xk3Qw9Zt5Lb7Nc2Md4Pf6Rg8Sh1Vj0Wa3Ye5Ui7a";

  it("names the line the value sits on", () => {
    expect(
      lineOf(
        "apps/infra/wrangler.yaml",
        [
          "services:",
          "  demo:",
          "    CLOUDFLARE_API_TOKEN: |-",
          `      ${planted}`,
        ].join("\n")
      )
    ).toEqual([4]);
  });

  it("fails on a block scalar value in quotes", () => {
    expect(
      ruleOf("apps/infra/wrangler.yaml", `api_secret: >-\n  "${planted}"`)
    ).toEqual(["secret-block-scalar"]);
  });

  it("passes on a block scalar read from the environment", () => {
    expect(
      ruleOf(
        "apps/infra/wrangler.yaml",
        "api_secret: |-\n  read-from-the-environment"
      )
    ).toEqual([]);
  });
});

describe("a sort code and an account number in any written form fail", () => {
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

    const sample = [...firstRecord, "", ...secondRecord];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([]);
  });

  it("passes an account number split from its sort code by a blank line", () => {
    const sample = [
      `sortCode: "${sortCode(" ")}",`,
      "",
      `number: "${accountNumber("")}",`,
    ];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([]);
  });

  it("passes a sort code split from its account number by a blank line", () => {
    const sample = [
      `number: "${accountNumber("")}",`,
      "",
      `sortCode: "${sortCode(" ")}",`,
    ];

    expect(ruleOf("apps/site/src/profile.ts", sample.join("\n"))).toEqual([]);
  });

  it("names the sort code line when the pair sits two lines apart", () => {
    const sample = [
      `const sortCode = "${sortCode(" ")}";`,
      `const review = "Demo note for the pair";`,
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
      value: "GB82WEST12345698765432",
    },
  ]);

  it("passes on the value inside the file the allow list names", () => {
    expect(
      ruleOf(testFile, 'const iban = "GB82WEST12345698765432";', allow)
    ).toEqual([]);
  });

  it("fails on the same value inside another file", () => {
    expect(
      ruleOf(
        "apps/cli/src/accounts.ts",
        'const iban = "GB82WEST12345698765432";',
        allow
      )
    ).toEqual(["iban"]);
  });

  it("fails on the same rule when the value is not the allowed one", () => {
    expect(
      ruleOf(testFile, 'const iban = "DE89370400440532013000";', allow)
    ).toEqual(["iban"]);
  });

  it("lets an allowed value excuse the pair only in the file it names", () => {
    const sortCodeAllow = withValues([
      {
        path: "scripts/sample.ts",
        reason: "A made-up amount in cents, not a branch.",
        value: grouped(["00", "00", "00"], " "),
      },
    ]);

    const sample = bankSample(
      grouped(["00", "00", "00"], " "),
      grouped(["1234", "5678"], "")
    );

    expect(ruleOf("scripts/sample.ts", sample, sortCodeAllow)).toEqual([]);

    expect(ruleOf("scripts/other.ts", sample, sortCodeAllow)).toEqual([
      "bank-account",
    ]);
  });

  it("passes on a file the allow list skips, with a reason", () => {
    const skipped: AllowList = {
      skipped: [
        { path: "pnpm-lock.yaml", reason: "pnpm writes this lockfile." },
      ],
      values: [],
    };

    expect(
      ruleOf("pnpm-lock.yaml", 'resolution: "GB82WEST12345698765432"', skipped)
    ).toEqual([]);
  });
});

describe("the rule and view matrix covers every cell", () => {
  it("runs every rule on every view it declares, and declares the rest", () => {
    expect(GUARD_RULES).toEqual([...RULE_IDS]);

    expect(Object.keys(PERSONAL_DATA_MATRIX).toSorted()).toEqual(
      [...RULE_IDS].toSorted()
    );

    const faults = RULE_IDS.flatMap((rule) =>
      VIEW_IDS.flatMap((view) => {
        const declared = PERSONAL_DATA_MATRIX[rule][view];

        if (declared === undefined) {
          return [`${rule}/${view} is missing from the matrix`];
        }

        if (declared.reason.trim().length === 0) {
          return [`${rule}/${view} has no reason`];
        }

        return declared.applies ? [] : [];
      })
    );

    expect(faults).toEqual([]);

    expect(Object.values(PERSONAL_DATA_MATRIX).flatMap(Object.keys)).toEqual(
      RULE_IDS.flatMap(() => [...VIEW_IDS])
    );
  });

  it("reads the text as written for every rule", () => {
    const skippedRaw = RULE_IDS.filter(
      (rule) => !PERSONAL_DATA_MATRIX[rule].raw.applies
    );

    expect(skippedRaw).toEqual([]);
  });

  it("gives every rule and every view something to do", () => {
    const idleRules = RULE_IDS.filter(
      (rule) =>
        !VIEW_IDS.some((view) => PERSONAL_DATA_MATRIX[rule][view].applies)
    );

    const idleViews = VIEW_IDS.filter(
      (view) =>
        !RULE_IDS.some((rule) => PERSONAL_DATA_MATRIX[rule][view].applies)
    );

    expect({ idleRules, idleViews }).toEqual({ idleRules: [], idleViews: [] });
  });
});

describe("the fourth verdict's reproductions fail", () => {
  it("fails on a date written between a sort code and an account number", () => {
    expect(
      ruleOf(
        "docs/payments.md",
        "Sort code: 23-45-67; Last synced: 2026-11-16; Account number: 98765432"
      )
    ).toEqual(["bank-account"]);
  });

  it("fails on an IBAN split by markdown emphasis", () => {
    expect(
      ruleOf("docs/payments.md", "IBAN: **GB82** WEST **1234** 5698 7654 32")
    ).toEqual(["iban"]);
  });

  it("fails on a mailbox written as quoted-printable", () => {
    expect(
      ruleOf("docs/mail-export.md", "To: demo.person=40mailhost.co.uk")
    ).toEqual(["email"]);
  });

  it("fails on a mailbox written as standard base64", () => {
    const encoded = "ZGVtby5wZXJzb25AbWFpbGhvc3QuY28udWs=";

    expect(
      ruleOf(
        "docs/mail-export.md",
        `Content-Transfer-Encoding: base64\n\n${encoded}`
      )
    ).toEqual(["email"]);
  });

  it("fails on a mailbox written as url-alphabet base64", () => {
    const encoded = "ZGVtby5wZXJzb25AbWFpbGhvc3QuY28udWs";

    expect(ruleOf("docs/mail-export.md", encoded)).toEqual(["email"]);
  });

  it("fails on a bank pair written as base64", () => {
    const encoded = "c29ydF9jb2RlIDIzIDQ1IDY3IGFjY291bnQgbnVtYmVyIDk4NzY1NDMy";

    expect(ruleOf("docs/mail-export.md", encoded)).toEqual(["bank-account"]);
  });

  it("fails on a Cloudflare account id written as JSON escapes", () => {
    expect(
      ruleOf(
        "apps/infra/wrangler.json",
        '{"account_id":"\\u0030123456789abcdef0123456789abcdef"}'
      )
    ).toEqual(["cloudflare-account-id"]);
  });

  it("keeps an undecodable base64 run quiet", () => {
    expect(
      ruleOf(
        "docs/notes.md",
        "checksum Xk3Qw9Zt5Lb7Nc2Md4Pf6Rg8Sh1Vj0Wa3Ye5Ui7a"
      )
    ).toEqual([]);
  });
});

describe("an amount allowance excuses only the amount column of its file", () => {
  const path = "packages/bank-import/fixtures/demo-bank.csv";

  const header = "date,description,amount_minor,currency,reference";

  const amountAllow = withValues([
    {
      column: "amount_minor",
      path,
      reason:
        "A made-up amount in cents, and six digits make it sort-code shaped.",
      value: "480000",
    },
  ]);

  it("passes on the amount cell of a demo row", () => {
    const csv = [
      header,
      "2026-01-06,Sort code transfer,480000,EUR,98765432",
    ].join("\n");

    expect(ruleOf(path, csv, amountAllow)).toEqual([]);
  });

  it("fails on the same digits in a column that is not the amount column", () => {
    const csv = [
      header,
      "2026-01-06,Sort code transfer 480000,116100,EUR,98765432",
    ].join("\n");

    expect(ruleOf(path, csv, amountAllow)).toEqual(["bank-account"]);
  });

  it("fails on a sort code the allowance names when it sits beside a real account", () => {
    const csv = [
      header,
      "2026-01-06,Sort code transfer,116100,EUR,98765432",
    ].join("\n");

    expect(ruleOf(path, csv, amountAllow)).toEqual(["bank-account"]);
  });
});

const joined = (...parts: readonly string[]) => parts.join("");

const mailHost = joined("mail", "host.co.uk");

const verifierIban = joined("GB82", "WEST", "1234", "5698", "7654", "32");

const accountIdValue = joined(
  "0123",
  "4567",
  "89ab",
  "cdef",
  "0123",
  "4567",
  "89ab",
  "cdef"
);

const longReference =
  "invoice 4471 for the March statement, quote this reference on the transfer";

describe("the fifth verdict's reproductions fail", () => {
  it("fails on an env file whose account number starts with an escape", () => {
    expect(
      ruleOf(
        "apps/cli/.env.demo",
        [
          `SORT_CODE=${sortCode("-")}`,
          `ACCOUNT_NUMBER=${accountNumber("")}`,
        ].join("\n")
      )
    ).toEqual(["bank-account"]);
  });

  it("fails on the same pair inside a URL query", () => {
    expect(
      ruleOf(
        "docs/payments.md",
        `Pay at https://demo.example/pay?sort=${sortCode("-")}&account=${accountNumber("")}`
      )
    ).toEqual(["bank-account"]);
  });

  it("reads a quoted-printable IBAN with spaces escaped per RFC 2045", () => {
    expect(
      ruleOf(
        "docs/mail-export.md",
        `IBAN:=20${verifierIban.slice(0, 4)}=20${verifierIban.slice(4, 8)}=20${verifierIban.slice(8, 12)}=20${verifierIban.slice(12)}`
      )
    ).toContain("iban");
  });

  it("reads a mailbox joined by a soft line break", () => {
    expect(
      ruleOf("docs/mail-export.md", `To: demo.person@mail=\r\n${mailHost}`)
    ).toEqual(["email"]);
  });

  it("fails on a bank pair inside a long YAML record", () => {
    expect(
      ruleOf(
        "apps/cli/demo.yaml",
        [
          "payment:",
          `  sort_code: ${sortCode("-")}`,
          `  reference: ${longReference}`,
          `  account_number: ${accountNumber("")}`,
        ].join("\n")
      )
    ).toEqual(["bank-account"]);
  });

  it("fails on a bank pair inside a long CSV row", () => {
    expect(
      ruleOf(
        "packages/bank-import/fixtures/demo.csv",
        [
          "sort_code,reference,account_number",
          `${sortCode("-")},${longReference.replaceAll(",", " ")},${accountNumber("")}`,
        ].join("\n")
      )
    ).toEqual(["bank-account"]);
  });
});

const wrappedWide = (encoded: string, width: number) => {
  const lines: string[] = [];

  for (let index = 0; index < encoded.length; index += width) {
    lines.push(encoded.slice(index, index + width));
  }

  return lines;
};

const LINE_ENDINGS = ["\n", "\r\n", "\r"] as const;

describe("the sixth verdict's reproductions fail", () => {
  it.each(LINE_ENDINGS)(
    "fails on a quoted-printable soft break inside a YAML block scalar with %j line endings",
    (ending) => {
      expect(
        ruleOf(
          "docs/mail-export.md",
          [
            "mail_body: |",
            `  demo.person@${mailHost.slice(0, 4)}=`,
            `  ${mailHost.slice(4)}`,
          ].join(ending)
        )
      ).toEqual(["email"]);
    }
  );

  it.each(LINE_ENDINGS)(
    "fails on indented base64 wraps inside a YAML block scalar with %j line endings",
    (ending) => {
      const body = `Invoice recipient contact: demo.person@${mailHost}`;

      const lines = wrappedWide(
        Buffer.from(body, "utf-8").toString("base64"),
        42
      );

      expect(
        ruleOf(
          "docs/mail-export.md",
          ["mail_body: |", ...lines.map((line) => `  ${line}`)].join(ending)
        )
      ).toEqual(["email"]);
    }
  );

  it.each(LINE_ENDINGS)(
    "keeps reading a sort code in one row and an account number in the next row of one table with %j line endings",
    (ending) => {
      expect(
        ruleOf(
          "packages/bank-import/fixtures/demo.csv",
          [
            "sort_code,account_number",
            `${sortCode("-")},`,
            `,${accountNumber("")}`,
          ].join(ending)
        )
      ).toEqual(["bank-account"]);
    }
  );
});

describe("every decoder reads both views", () => {
  const containerText = [
    "mail_body: |",
    `  demo.person@${mailHost.slice(0, 4)}=`,
    `  ${mailHost.slice(4)}`,
  ].join("\n");

  it("runs every decoder in the table on the text as written", () => {
    expect(DECODERS.map((decoder) => decoder.id).toSorted()).toEqual(
      [
        "base64",
        "entity",
        "fold",
        "form-plus",
        "json-escape",
        "percent",
        "quoted-printable",
        "tag",
        "zero-width",
      ].toSorted()
    );

    expect([...decodeChains(containerText).ranOn.written].toSorted()).toEqual(
      DECODERS.map((decoder) => decoder.id).toSorted()
    );
  });

  it("runs every decoder in the table on the container-stripped text too", () => {
    const chains = decodeChains(containerText);

    expect(chains.stripped.length).toBeGreaterThan(0);

    expect([...chains.ranOn.stripped].toSorted()).toEqual(
      DECODERS.map((decoder) => decoder.id).toSorted()
    );

    expect(
      chains.stripped.map((chain) => chain.text.text).join("\n")
    ).toContain(`demo.person@${mailHost}`);
  });

  it("skips the container-stripped view when no line needs a wrapper removed", () => {
    expect(decodeChains("A line of prose.\nAnother line.").stripped).toEqual(
      []
    );
  });
});

describe("an earlier verdict's reproduction still fails", () => {
  it.each([
    [
      "v39 colon-adjacent JSON bank fields",
      `{"sortCode":${sortCode("")},"accountNumber":${accountNumber("")}}`,
    ],
    [
      "v39 space-separated bank pair",
      `Sort code ${sortCode("-")}, account ${accountNumber("")}`,
    ],
    [
      "v39 line-wrapped IBAN",
      `${verifierIban.slice(0, 8)} ${verifierIban.slice(8, 12)}\n${verifierIban.slice(12, 16)} ${verifierIban.slice(16, 20)} ${verifierIban.slice(20)}`,
    ],
    ["v39 quoted mailbox", `"demo owner"@${mailHost}`],
    [
      "v45 JSON-escaped quoted mailbox",
      `{"mail":"\\"demo owner\\"@${mailHost}"}`,
    ],
    [
      "v45 HTML-wrapped IBAN",
      `${verifierIban.slice(0, 8)} ${verifierIban.slice(8, 12)}<br>${verifierIban.slice(12, 16)} ${verifierIban.slice(16, 20)} ${verifierIban.slice(20)}`,
    ],
    ["v45 entity-encoded link", `mailto:demo.person&#64;${mailHost}`],
    ["v49 percent-encoded link", `mailto:demo.person%40${mailHost}`],
    [
      "v49 form-encoded IBAN",
      `iban=${verifierIban.slice(0, 4)}+${verifierIban.slice(4, 8)}+${verifierIban.slice(8, 12)}+${verifierIban.slice(12, 16)}+${verifierIban.slice(16, 20)}+${verifierIban.slice(20)}`,
    ],
    [
      "v49 multiline tag inside an IBAN",
      `${verifierIban.slice(0, 8)} ${verifierIban.slice(8, 12)}<br\n class="bank">${verifierIban.slice(12, 16)} ${verifierIban.slice(16, 20)} ${verifierIban.slice(20)}`,
    ],
    [
      "v54 date between a bank pair",
      `Sort code: ${sortCode("-")}; Last synced: 2026-11-16; Account number: ${accountNumber("")}`,
    ],
    [
      "v54 emphasis inside an IBAN",
      `IBAN: **${verifierIban.slice(0, 4)}** ${verifierIban.slice(4, 8)} **${verifierIban.slice(8, 12)}** ${verifierIban.slice(12, 16)} ${verifierIban.slice(16, 20)} ${verifierIban.slice(20)}`,
    ],
    ["v54 quoted-printable mailbox", `To: demo.person=40${mailHost}`],
    [
      "v54 JSON-escaped account id",
      `{"account_id":"\\u0030${accountIdValue.slice(1)}"}`,
    ],
  ])("fails on %s", (_label, text) => {
    expect(ruleOf("apps/cli/src/ids.ts", text).length).toBeGreaterThan(0);
  });
});

const base64Lines = (text: string, width: number) =>
  Buffer.from(text, "utf-8")
    .toString("base64")
    .match(new RegExp(`.{1,${width}}`, "gu")) ?? [];

describe("the seventh verdict's reproductions", () => {
  it.each([
    [
      "v62 env pair",
      "apps/cli/.env.demo",
      [
        `SORT_CODE=${sortCode("-")}`,
        `ACCOUNT_NUMBER=${accountNumber("")}`,
      ].join("\n"),
    ],
    [
      "v62 quoted-printable IBAN with escaped spaces",
      "docs/mail-export.md",
      `IBAN:=20${verifierIban.slice(0, 4)}=20${verifierIban.slice(4, 8)}=20${verifierIban.slice(8, 12)}=20${verifierIban.slice(12)}`,
    ],
    [
      "v68 indented quoted-printable soft break",
      "docs/mail-export.md",
      ["mail_body: |", `  demo.person@mail=`, `  ${mailHost}`].join("\n"),
    ],
    [
      "v72 nested quote prefixes around a soft break",
      "docs/mail-export.md",
      ["> > demo.person@mail=", `> > ${mailHost}`].join("\n"),
    ],
    [
      "v72 diff additions around a soft break",
      "docs/mail-export.md",
      ["+ demo.person@mail=", `+ ${mailHost}`].join("\n"),
    ],
    [
      "v72 markdown table cells around a soft break",
      "docs/mail-export.md",
      ["| a | b | demo.person@mail= |", `| a | b | ${mailHost} |`].join("\n"),
    ],
    [
      "v72 numbered list around a soft break",
      "docs/mail-export.md",
      ["1. demo.person@mail=", `2. ${mailHost}`].join("\n"),
    ],
    [
      "v74 unspaced diff additions around a soft break",
      "docs/mail-export.md",
      ["+demo.person@mail=", `+${mailHost}`].join("\n"),
    ],
    [
      "v74 first table column around a soft break",
      "docs/mail-export.md",
      [
        "| Exported body | Status |",
        "| --- | --- |",
        "| demo.person@mail= | saved |",
        `| ${mailHost} | saved |`,
      ].join("\n"),
    ],
    [
      "v74 middle table column behind escaped pipes",
      "docs/mail-export.md",
      [
        "| Note | Exported body | Status |",
        "| --- | --- | --- |",
        "| a \\| b | demo.person@mail= | saved |",
        `| c \\| d | ${mailHost} | saved |`,
      ].join("\n"),
    ],
    [
      "v74 short row in a table column that pads",
      "docs/mail-export.md",
      [
        "| Status | Note | Exported body |",
        "| --- | --- | --- |",
        "| saved | a | demo.person@mail= |",
        `| saved | ${mailHost} |`,
      ].join("\n"),
    ],
    [
      "v74 table column inside a diff hunk",
      "docs/mail-export.md",
      [
        "@@ -1,2 +1,4 @@",
        "+| Exported body | Status |",
        "+| --- | --- |",
        "+| demo.person@mail= | saved |",
        `+| ${mailHost} | saved |`,
      ].join("\n"),
    ],
  ])("fails on %s", (_label, filePath, text) => {
    expect(ruleOf(filePath, text).length).toBeGreaterThan(0);
  });

  it.each([
    [
      "no outer pipes on any row",
      [
        "Exported body | Status",
        "--- | ---",
        "demo.person@mail= | saved",
        `${mailHost} | saved`,
      ],
    ],
    [
      "outer pipes on the rows but not the header",
      [
        "Exported body | Status",
        "--- | ---",
        "| demo.person@mail= | saved |",
        `| ${mailHost} | saved |`,
      ],
    ],
    [
      "a ragged row with extra cells",
      [
        "Status | Exported body | Note",
        "--- | --- | ---",
        "saved | demo.person@mail= | a | extra",
        `saved | ${mailHost} | b | extra`,
      ],
    ],
    [
      "a row with a missing trailing cell",
      [
        "Status | Exported body | Note",
        "--- | --- | ---",
        "saved | demo.person@mail=",
        `saved | ${mailHost}`,
      ],
    ],
  ])("fails on a table written with %s", (_label, lines) => {
    expect(ruleOf("docs/mail-export.md", lines.join("\n"))).toEqual(["email"]);
  });

  it("passes a pipe row that no separator row turns into a table", () => {
    const lines = [
      "Exported body | Status",
      "demo.person@mail= | saved",
      `${mailHost} | saved`,
    ];

    expect(ruleOf("docs/mail-export.md", lines.join("\n"))).toEqual([]);
  });

  it("fails on a wrapped address in the first column of a table without outer pipes", () => {
    const lines = [
      "| Exported body | Status |",
      "| --- | --- |",
      "| demo.person@mail= | saved",
      `| ${mailHost} | saved |`,
    ];

    expect(ruleOf("docs/mail-export.md", lines.join("\n"))).toEqual(["email"]);
  });

  it("fails on a wrapped base64 payload in the first table column", () => {
    const lines = base64Lines(
      `Invoice contact demo.person@${mailHost}`,
      40
    ).map((line) => `| ${line} | saved |`);

    expect(
      ruleOf(
        "docs/mail-export.md",
        ["| Exported body | Status |", "| --- | --- |", ...lines].join("\n")
      )
    ).toEqual(["email"]);
  });

  it.each(LINE_ENDINGS)(
    "keeps a blank line that ends a table quiet with %j line endings",
    (ending) => {
      expect(
        ruleOf(
          "docs/mail-export.md",
          [
            "| Exported body | Status |",
            "| --- | --- |",
            "| demo.person@mail= | saved |",
            "",
            `| ${mailHost} | saved |`,
          ].join(ending)
        )
      ).toEqual([]);
    }
  );

  it("fails on base64 additions split across diff lines", () => {
    const lines = base64Lines(
      `Invoice contact demo.person@${mailHost}`,
      40
    ).map((line) => `+ ${line}`);

    expect(ruleOf("docs/mail-export.md", lines.join("\n"))).toEqual(["email"]);
  });

  it.each(LINE_ENDINGS)(
    "keeps a blank-line split quiet with %j line endings",
    (ending) => {
      expect(
        ruleOf(
          "apps/cli/demo.yaml",
          [
            `sort_code: ${sortCode("-")}`,
            "",
            `account_number: ${accountNumber("")}`,
          ].join(ending)
        )
      ).toEqual([]);
    }
  );

  it.each(LINE_ENDINGS)(
    "keeps two YAML entries quiet with %j line endings",
    (ending) => {
      expect(
        ruleOf(
          "apps/cli/demo.yaml",
          [
            "first:",
            `  sort_code: ${sortCode("-")}`,
            "second:",
            `  account_number: ${accountNumber("")}`,
          ].join(ending)
        )
      ).toEqual([]);
    }
  );

  it.each(LINE_ENDINGS)(
    "detects a true pair in one YAML entry with %j line endings",
    (ending) => {
      expect(
        ruleOf(
          "apps/cli/demo.yaml",
          [
            "payment:",
            `  sort_code: ${sortCode("-")}`,
            `  account_number: ${accountNumber("")}`,
          ].join(ending)
        )
      ).toEqual(["bank-account"]);
    }
  );

  it.each(LINE_ENDINGS)(
    "detects a true pair on one line with %j line endings",
    (ending) => {
      expect(
        ruleOf(
          "docs/payments.md",
          [
            `Sort code: ${sortCode("-")}`,
            `Account number: ${accountNumber("")}`,
          ].join(ending)
        )
      ).toEqual(["bank-account"]);
    }
  );
});
