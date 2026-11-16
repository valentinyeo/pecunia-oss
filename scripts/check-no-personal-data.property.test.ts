// @effect-diagnostics nodeBuiltinImport:off -- The JWT property runs the installed gitleaks over a probe file it writes under the system temporary directory.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  coAuthorEmailsIn,
  identityOffenders,
  parseIdentityLog,
  withCoAuthors,
} from "./check-commit-identity.ts";
import {
  decodeAllowList,
  findPersonalData,
  RULE_IDS,
} from "./check-no-personal-data.ts";
import type { AllowList, RuleId } from "./check-no-personal-data.ts";
import { decodeText } from "./decoded-text.ts";

const empty: AllowList = { skipped: [], values: [] };

const CASES = 120;

const SEED = 20_260_101;

const rulesOf = (filePath: string, text: string) =>
  findPersonalData(filePath, text, empty).map((finding) => finding.rule);

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const ALPHANUMERIC = `${LETTERS}0123456789`;

const WORDS = [
  "wire",
  "to",
  "the",
  "account",
  "reference",
  "please",
  "before",
  "friday",
  "demo",
  "note",
  "payment",
  "invoice",
  "bank",
  "branch",
  "label",
  "record",
  "value",
  "field",
  "holder",
  "currency",
  "example",
  "total",
  "amount",
  "number",
  "code",
  "sort",
  "export",
  "fixture",
  "sample",
  "statement",
];

interface Random {
  readonly alphanumeric: (count: number) => string;
  readonly between: (low: number, high: number) => number;
  readonly digits: (count: number) => string;
  readonly pick: <T>(items: readonly T[]) => T;
  readonly prose: (count: number) => string;
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

  const characters = (alphabet: string, count: number) => {
    let text = "";

    for (let index = 0; index < count; index += 1) {
      const character = alphabet[between(0, alphabet.length - 1)];

      if (character === undefined) {
        throw new Error("read past the alphabet");
      }

      text += character;
    }

    return text;
  };

  return {
    alphanumeric: (count) => characters(ALPHANUMERIC, count),
    between,
    digits: (count) => characters("0123456789", count),
    pick,
    prose: (count) => {
      const words = Array.from({ length: count }, () => pick(WORDS));

      return words.join(" ");
    },
  };
};

const SEPARATORS = [
  "",
  "",
  " ",
  "  ",
  "\t",
  "\u00A0",
  "\u2007",
  "\u202F",
  "\u3000",
  "\n",
  "\r\n",
  ",\n",
  ",",
  ", ",
  ":",
  ": ",
  "=",
  " = ",
  "--",
  " - ",
];

const QUOTES = [`"`, "'", "\u0060", "\u2018", "\u2019", "\u201C", "\u201D"];

const separatedBy = (parts: readonly string[], random: Random) => {
  let text = parts[0] ?? "";

  for (const part of parts.slice(1)) {
    text += `${random.pick(SEPARATORS)}${part}`;
  }

  return text;
};

const inQuotes = (text: string, random: Random) => {
  const quote = random.pick(QUOTES);

  return `${quote}${text}${quote}`;
};

const decorated = (text: string, random: Random) =>
  random.pick([
    `${random.prose(3)} ${text} ${random.prose(2)}`,
    `value: ${text}`,
    `value=${text}`,
    `value,${text}`,
    `{"value": ${inQuotes(text, random)}}`,
    `{"value":${inQuotes(text, random)}},`,
    `value: ${inQuotes(text, random)}`,
    inQuotes(text, random),
    `| field | value |\n| --- | --- |\n| value | ${text} |`,
    `field,value\nvalue,${text}`,
    `${random.prose(2)} ${inQuotes(text, random)} ${random.prose(2)}`,
  ]);

const IBAN_COUNTRIES: readonly (readonly [string, number])[] = [
  ["GB", 22],
  ["DE", 22],
  ["FR", 27],
  ["NL", 18],
  ["NO", 15],
  ["ES", 24],
  ["IT", 27],
  ["BE", 16],
  ["IE", 22],
  ["CH", 21],
  ["AT", 20],
  ["SE", 24],
  ["PL", 28],
  ["DK", 18],
  ["PT", 25],
];

const ibanCheckDigits = (country: string, bban: string) => {
  const rearranged = `${bban}${country}00`;

  let remainder = 0;

  for (const character of rearranged.toUpperCase()) {
    const digits =
      character >= "A" && character <= "Z"
        ? String((character.codePointAt(0) ?? 0) - 55)
        : character;

    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return String(98 - remainder).padStart(2, "0");
};

const ibanValue = (random: Random) => {
  const [country, length] = random.pick(IBAN_COUNTRIES);

  const bban = `${random.alphanumeric(4)}${random.digits(length - 8)}`;

  const body = `${country}${ibanCheckDigits(country, bban)}${bban}`;

  const parts: string[] = [];

  for (let index = 0; index < body.length;) {
    const size = random.between(1, 4);

    parts.push(body.slice(index, index + size));

    index += size;
  }

  const text = separatedBy(parts, random);

  return random.between(1, 3) === 1 ? text.toLowerCase() : text;
};

const ibanDocument = (random: Random) => decorated(ibanValue(random), random);

const BANK_SEPARATORS = [
  "",
  "",
  " ",
  "  ",
  "\n",
  "\r\n",
  "\u00A0",
  "\u2007",
  "\u202F",
  "-",
  "\u2011",
  "\u2013",
  ".",
  " \u00A0",
  "--",
  " - ",
];

const inNumber = (parts: readonly string[], random: Random) => {
  let text = parts[0] ?? "";

  for (const part of parts.slice(1)) {
    text += `${random.pick(BANK_SEPARATORS)}${part}`;
  }

  return text;
};

const sortCodeValue = (random: Random) =>
  inNumber([random.digits(2), random.digits(2), random.digits(2)], random);

const accountValue = (random: Random) =>
  inNumber([random.digits(4), random.digits(4)], random);

const pairDocument = (random: Random) => {
  const sort = sortCodeValue(random);

  const account = accountValue(random);

  return random.pick([
    `sort code ${sort} account number ${account}`,
    `Account: sort code ${sort}\nAccount: number ${account}`,
    `{"sortCode":${sort},"accountNumber":${account}}`,
    `| sort code | account number |\n| --- | --- |\n| ${sort} | ${account} |`,
    `sort code,account number\n${sort},${account}`,
    `${random.prose(3)} sort code ${sort} account number ${account} ${random.prose(2)}`,
    `${random.prose(2)} (sort code ${sort}, account number ${account})`,
  ]);
};

const sortOnlyDocument = (random: Random) =>
  decorated(sortCodeValue(random), random);

interface Field {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

const KEY_PAIRS: readonly (readonly [string, string])[] = [
  ["sortCode", "accountNumber"],
  ["sort_code", "account_number"],
  ["SORTCODE", "ACCOUNTNUMBER"],
  ["sort-code", "account-number"],
  ["sort code", "account number"],
  ["Sort Code", "Account Number"],
];

const jsonText = (fields: readonly Field[]) =>
  [
    "{",
    ...fields.map(
      (field, index) =>
        `  "${field.key}": "${field.value}"${index === fields.length - 1 ? "" : ","}`
    ),
    "}",
  ].join("\n");

const compactJsonText = (fields: readonly Field[]) =>
  `{${fields.map((field) => `"${field.key}":"${field.value}"`).join(",")}}`;

const yamlText = (fields: readonly Field[]) =>
  fields.map((field) => `${field.key}: "${field.value}"`).join("\n");

const csvText = (fields: readonly Field[]) =>
  [
    fields.map((field) => field.key).join(","),
    fields.map((field) => field.value).join(","),
  ].join("\n");

const tsvText = (fields: readonly Field[]) =>
  [
    fields.map((field) => field.key).join("\t"),
    fields.map((field) => field.value).join("\t"),
  ].join("\n");

const markdownText = (fields: readonly Field[]) =>
  [
    `| ${fields.map((field) => field.key).join(" | ")} |`,
    `| ${fields.map(() => "---").join(" | ")} |`,
    `| ${fields.map((field) => field.value).join(" | ")} |`,
  ].join("\n");

const proseText = (fields: readonly Field[]) =>
  fields.map((field) => `The ${field.label} is ${field.value}.`).join(" ");

const FORMATS = [
  "json",
  "compact",
  "yaml",
  "csv",
  "tsv",
  "markdown",
  "prose",
] as const;

const bankDocument = (format: string, fields: readonly Field[]) => {
  if (format === "compact") {
    return compactJsonText(fields);
  }

  if (format === "yaml") {
    return yamlText(fields);
  }

  if (format === "csv") {
    return csvText(fields);
  }

  if (format === "tsv") {
    return tsvText(fields);
  }

  if (format === "markdown") {
    return markdownText(fields);
  }

  if (format === "prose") {
    return proseText(fields);
  }

  return jsonText(fields);
};

const fieldPairFields = (random: Random) => {
  const [sortKey, accountKey] = random.pick(KEY_PAIRS);

  const sortField: Field = {
    key: sortKey,
    label: "sort code",
    value: sortCodeValue(random),
  };

  const accountField: Field = {
    key: accountKey,
    label: "account number",
    value: accountValue(random),
  };

  const others = Array.from({ length: random.between(0, 4) }, (_, position) => {
    const key = `${random.pick(WORDS)}${position}`;

    return { key, label: key, value: random.pick(WORDS) };
  });

  return random.between(1, 2) === 1
    ? [sortField, ...others, accountField]
    : [accountField, ...others, sortField];
};

const fieldPairDocument = (random: Random) =>
  bankDocument(random.pick(FORMATS), fieldPairFields(random));

const singleFieldDocument = (random: Random) => {
  const fields = fieldPairFields(random);

  const field = fields[0] ?? { key: "value", label: "value", value: "demo" };

  return bankDocument(random.pick(FORMATS), [
    {
      ...field,
      key: field.key,
      value: random.pick([sortCodeValue(random), accountValue(random)]),
    },
  ]);
};

const EMAIL_LOCALS = [
  "owner",
  "jane.doe",
  "a+b",
  "o'brien",
  "j_doe",
  "1st",
  "jos\u00E9",
  "jose\u0301",
  "\u03B4\u03BF\u03BA\u03B9\u03BC\u03AE",
  "\u5C71\u7530",
  "\u00DFeta",
  "\u00E9lodie",
  "j\u00F6rg",
];

const EMAIL_DOMAINS = [
  "acme.com",
  "acme.co.uk",
  "b\u00FCcher.de",
  "bu\u0308cher.de",
  "sub.acme.co.uk",
  "xn--bcher-kva.de",
  "\u4F8B\u5B50.\u4E2D\u56FD",
  "acme.io",
];

const PLACEHOLDER_DOMAINS = [
  "example.com",
  "example.net",
  "example.org",
  "demo.example",
  "demo.invalid",
  "demo.localhost",
  "demo.test",
];

const mailboxNames = ["demo", "jane", "sam", "owner"];

const mailboxWords = ["owner", "doe", "smith", "finance"];

const MAILBOX_SEPARATORS = [
  "",
  " ",
  "  ",
  ":",
  ": ",
  "=",
  " = ",
  ",",
  ", ",
  " - ",
  " ",
];

const quotedMailbox = (random: Random) => {
  const local = `${random.pick(mailboxNames)}${random.pick(MAILBOX_SEPARATORS)}${random.pick(mailboxWords)}`;

  return `"${local}"@${random.pick(EMAIL_DOMAINS)}`;
};

const quotedMailboxDocument = (random: Random) =>
  decorated(quotedMailbox(random), random);

const placeholderMailbox = (random: Random) =>
  `"${random.pick(mailboxNames)} ${random.pick(mailboxWords)}"@${random.pick(PLACEHOLDER_DOMAINS)}`;

const emailDocument = (random: Random) =>
  decorated(
    `${random.pick(EMAIL_LOCALS)}@${random.pick(EMAIL_DOMAINS)}`,
    random
  );

const placeholderEmailDocument = (random: Random) =>
  decorated(
    `${random.pick(EMAIL_LOCALS)}@${random.pick(PLACEHOLDER_DOMAINS)}`,
    random
  );

const accountIdValue = (random: Random) =>
  `${random.digits(8)}${random.digits(8)}${random.digits(8)}${random.digits(8)}`;

const accountIdDocument = (random: Random) =>
  random.pick([
    `{"account_id": "${accountIdValue(random)}"}`,
    `account_id: ${accountIdValue(random)}`,
    `const accountId = "${accountIdValue(random)}";`,
    `See https://dash.cloudflare.com/${accountIdValue(random)}/workers`,
  ]);

const hostnameValue = (random: Random) => {
  const label = `planted-${random.alphanumeric(8).toLowerCase()}`;

  return `${label}.${random.pick(["workers.dev", "pages.dev", "cloudflareaccess.com"])}`;
};

const hostnameDocument = (random: Random) => {
  const hostname = hostnameValue(random);

  return random.pick([
    `Live at <https://${hostname}/health>.`,
    `Deploy target: ${hostname}`,
    `{"url": "https://${hostname}"}`,
    `https://${hostname.slice(0, 9)}\n${hostname.slice(9)}/health`,
    `| host |\n| --- |\n| ${hostname} |`,
  ]);
};

const exampleHostname = (random: Random) =>
  random.pick([
    "example.workers.dev",
    "example.pages.dev",
    "example.cloudflareaccess.com",
    "*.workers.dev",
    "*.pages.dev",
  ]);

const secretValue = (random: Random) =>
  `${random.alphanumeric(32)}${random.digits(8)}`;

const secretBlock = (value: string) =>
  [
    "services:",
    "  demo:",
    "    CLOUDFLARE_API_TOKEN: |-",
    `      ${value}`,
  ].join("\n");

const secretBlockDocument = (random: Random) =>
  secretBlock(random.pick([secretValue(random), `"${secretValue(random)}"`]));

const secretBlockWithoutToken = (random: Random) =>
  secretBlock(
    random.pick([
      "read-from-the-environment",
      "example-value-for-the-demo",
      "demo",
      '"demo-token-value"',
    ])
  );

interface Detector {
  readonly covers: readonly RuleId[];
  readonly harmless: (random: Random) => string;
  readonly name: string;
  readonly path: string;
  readonly sensitive: (random: Random) => string;
}

const DETECTORS: readonly Detector[] = [
  {
    covers: ["iban"],
    harmless: (random) =>
      random.pick([
        'const code = "at12";',
        "the id is 12 and the total is 34",
        'const pin = "ab12cd34ef56789012345678901234567890123";',
        'const digest = "0123456789abcdef0123456789abcdef";',
      ]),
    name: "iban",
    path: "docs/payments.md",
    sensitive: ibanDocument,
  },
  {
    covers: ["bank-account"],
    harmless: sortOnlyDocument,
    name: "sort-code-and-account",
    path: "docs/payments.md",
    sensitive: pairDocument,
  },
  {
    covers: ["bank-account"],
    harmless: singleFieldDocument,
    name: "bank-field-pair",
    path: "apps/site/src/profile.ts",
    sensitive: fieldPairDocument,
  },
  {
    covers: ["email"],
    harmless: placeholderMailbox,
    name: "quoted-mailbox-email",
    path: "docs/payments.md",
    sensitive: quotedMailboxDocument,
  },
  {
    covers: ["email"],
    harmless: placeholderEmailDocument,
    name: "email",
    path: "apps/site/test/fixture.ts",
    sensitive: emailDocument,
  },
  {
    covers: ["cloudflare-account-id"],
    harmless: (random) => `const id = "${accountIdValue(random)}";`,
    name: "cloudflare-account-id",
    path: "apps/cli/src/ids.ts",
    sensitive: accountIdDocument,
  },
  {
    covers: ["cloudflare-hostname"],
    harmless: exampleHostname,
    name: "cloudflare-hostname",
    path: "README.md",
    sensitive: hostnameDocument,
  },
  {
    covers: ["secret-block-scalar"],
    harmless: secretBlockWithoutToken,
    name: "secret-block-scalar",
    path: "apps/infra/wrangler.yaml",
    sensitive: secretBlockDocument,
  },
  {
    covers: ["decode-did-not-settle"],
    harmless: (random) => `${random.prose(3)} &amp; ${random.prose(2)}`,
    name: "unsettled-decoding",
    path: "docs/notes.md",
    sensitive: (random) =>
      `${random.prose(2)} &${"amp;".repeat(9)} ${random.prose(2)}`,
  },
];

const allowPath = path.resolve(
  import.meta.dirname,
  "no-personal-data-allow.json"
);

const allowList = decodeAllowList(readFileSync(allowPath, "utf-8"));

describe("every sensitive value is reported whatever formatting wraps it", () => {
  it(`reports ${DETECTORS.length * CASES} seeded wrappings and keeps the harmless values quiet`, () => {
    const uncovered = RULE_IDS.filter(
      (rule) => !DETECTORS.some((detector) => detector.covers.includes(rule))
    );

    expect(uncovered).toEqual([]);

    const missed: string[] = [];

    const noisy: string[] = [];

    for (const [kind, detector] of DETECTORS.entries()) {
      const random = makeRandom(SEED + kind);

      for (let index = 0; index < CASES; index += 1) {
        const sensitive = detector.sensitive(random);

        const rules = rulesOf(detector.path, sensitive);

        if (!detector.covers.every((rule) => rules.includes(rule))) {
          missed.push(`${detector.name}: ${sensitive}`);
        }

        const harmless = detector.harmless(random);

        if (rulesOf(detector.path, harmless).length > 0) {
          noisy.push(`${detector.name}: ${harmless}`);
        }
      }
    }

    for (const entry of allowList.values) {
      if (findPersonalData(entry.path, entry.value, allowList).length > 0) {
        noisy.push(`allow list: ${entry.path}`);
      }
    }

    expect({ missed, noisy }).toEqual({ missed: [], noisy: [] });
  }, 60_000);
});

const COMPOSED_CASES = 1500;

const COMPOSED_SEED = SEED + 9001;

const ENTITY_FORMS = new Map([
  ["@", ["&#64;", "&commat;", "&#x40;"]],
  [".", ["&#46;", "&#x2e;", "&period;"]],
  [" ", ["&nbsp;", "&#32;", "&#x20;"]],
  ["-", ["&#45;", "&#x2d;", "&dash;"]],
  ["%", ["&#37;", "&#x25;", "&percnt;"]],
  ["+", ["&#43;", "&#x2b;", "&plus;"]],
  ["|", ["&#124;", "&#x7c;", "&verbar;"]],
  [":", ["&#58;", "&#x3a;", "&colon;"]],
]);

const percentOf = (character: string) =>
  [...new TextEncoder().encode(character)]
    .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`)
    .join("");

const inEntityForm = (text: string, random: Random) =>
  text.replaceAll(/[@. %+|:-]/gu, (character) => {
    const forms = ENTITY_FORMS.get(character);

    return forms === undefined ? character : random.pick(forms);
  });

const asJsonString = (text: string) => JSON.stringify(text).slice(1, -1);

const asPercent = (text: string) =>
  text.replaceAll(/[^A-Za-z0-9\n]/gu, percentOf);

const asForm = (text: string) =>
  text.replaceAll(" ", "+").replaceAll(/[^A-Za-z0-9+\n]/gu, percentOf);

const TAG_FORMS = [
  "<br>",
  '<br\n class="bank">',
  '<span title="a > b">',
  "<b>",
  "<i class='note'>",
];

const withTags = (text: string, random: Random) => {
  const positions = Array.from({ length: random.between(1, 4) }, () =>
    random.between(1, Math.max(1, text.length - 1))
  ).toSorted((left, right) => right - left);

  let result = text;

  for (const position of positions) {
    result = `${result.slice(0, position)}${random.pick(TAG_FORMS)}${result.slice(position)}`;
  }

  return result;
};

const withZeroWidth = (text: string, random: Random) => {
  let result = text;

  for (let count = random.between(1, 4); count > 0; count -= 1) {
    const position = random.between(1, Math.max(1, result.length - 1));

    result = `${result.slice(0, position)}\u200B${result.slice(position)}`;
  }

  return result;
};

const asFullWidth = (text: string) =>
  text.replaceAll(/[0-9]/gu, (digit) =>
    String.fromCodePoint((digit.codePointAt(0) ?? 0) + 0xfe_e0)
  );

const inHref = (text: string, random: Random) =>
  random.pick([
    `<a href="mailto:${text}">contact</a>`,
    `<a href="${text}">bank details</a>`,
    `<a
      href="${text}"
      title="pay here"
    >pay</a>`,
  ]);

interface Encoder {
  readonly encode: (text: string, random: Random) => string;
  readonly name: string;
}

const COMPOSABLE_ENCODERS: readonly Encoder[] = [
  { encode: (text) => text, name: "identity" },
  { encode: asJsonString, name: "json-string" },
  { encode: inEntityForm, name: "html-entity" },
  { encode: asPercent, name: "percent" },
  { encode: asForm, name: "form-plus" },
  { encode: withTags, name: "tag-between" },
  { encode: withZeroWidth, name: "zero-width" },
  { encode: asFullWidth, name: "full-width-digits" },
  { encode: inHref, name: "href-attribute" },
];

interface ComposableLeak {
  readonly document: (value: string) => string;
  readonly encoders: readonly Encoder[];
  readonly name: string;
  readonly path: string;
  readonly rules: readonly RuleId[];
  readonly twin: (random: Random) => string;
  readonly twinDocument: (value: string) => string;
  readonly value: (random: Random) => string;
  readonly wrappers: readonly Encoder[];
}

const plainDocument = (value: string) => value;

const VERIFIER_IBAN = "GB82WEST12345698765432";

const ibanRemainder = (country: string, bban: string) => {
  const rearranged = `${bban}${country}00`.toUpperCase();

  let remainder = 0;

  for (const character of rearranged) {
    const digits =
      character >= "A" && character <= "Z"
        ? String((character.codePointAt(0) ?? 0) - 55)
        : character;

    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder;
};

const nonChecksumIban = (random: Random) => {
  const [country, length] = random.pick(IBAN_COUNTRIES);

  for (;;) {
    const bban = random.alphanumeric(length - 4);

    if (ibanRemainder(country, bban) !== 1) {
      return `${country}00${bban}`;
    }
  }
};

const VALUE_ENCODERS: readonly Encoder[] = COMPOSABLE_ENCODERS.filter(
  (encoder) =>
    !["identity", "tag-between", "href-attribute"].includes(encoder.name)
);

const WRAPPERS: readonly Encoder[] = COMPOSABLE_ENCODERS.filter((encoder) =>
  ["tag-between", "href-attribute"].includes(encoder.name)
);

const COMPOSABLE_LEAKS: readonly ComposableLeak[] = [
  {
    document: (value) => `Payments:\nIBAN: ${value}`,
    encoders: VALUE_ENCODERS,
    name: "iban",
    path: "docs/payments.md",
    rules: ["iban"],
    twin: nonChecksumIban,
    twinDocument: (value) => `Payments:\nIBAN: ${value}`,
    value: ibanValue,
    wrappers: WRAPPERS,
  },
  {
    document: (value) => `Payments: sort code ${value}`,
    encoders: VALUE_ENCODERS,
    name: "bank-pair",
    path: "docs/payments.md",
    rules: ["bank-account"],
    twin: (random) => `sort code ${sortCodeValue(random)}`,
    twinDocument: (value) => `Payments: ${value}`,
    value: (random) =>
      `${sortCodeValue(random)} account number ${accountValue(random)}`,
    wrappers: WRAPPERS,
  },
  {
    document: (value) => `Contact ${value} before Friday.`,
    encoders: VALUE_ENCODERS,
    name: "email",
    path: "docs/payments.md",
    rules: ["email"],
    twin: (random) =>
      `${random.pick(mailboxNames)}@${random.pick(PLACEHOLDER_DOMAINS)}`,
    twinDocument: (value) => `Contact ${value} before Friday.`,
    value: (random) =>
      `${random.pick(EMAIL_LOCALS)}@${random.pick(EMAIL_DOMAINS)}`,
    wrappers: WRAPPERS,
  },
  {
    document: (value) => `Contact ${value} before Friday.`,
    encoders: VALUE_ENCODERS,
    name: "quoted-mailbox",
    path: "docs/payments.md",
    rules: ["email"],
    twin: (random) =>
      `"${random.pick(mailboxNames)} ${random.pick(mailboxWords)}"@${random.pick(PLACEHOLDER_DOMAINS)}`,
    twinDocument: (value) => `Contact ${value} before Friday.`,
    value: quotedMailbox,
    wrappers: WRAPPERS,
  },
  {
    document: plainDocument,
    encoders: VALUE_ENCODERS.filter((encoder) => encoder.name !== "form-plus"),
    name: "block-scalar",
    path: "apps/infra/wrangler.yaml",
    rules: ["secret-block-scalar"],
    twin: secretBlockWithoutToken,
    twinDocument: plainDocument,
    value: secretBlockDocument,
    wrappers: [],
  },
];

describe("a leak survives any random composition of encodings", () => {
  it(`reads ${COMPOSED_CASES} seeded compositions and keeps every twin quiet`, () => {
    const random = makeRandom(COMPOSED_SEED);

    const missed: string[] = [];

    const noisy: string[] = [];

    const compose = (
      text: string,
      steps: readonly Encoder[],
      wrapper: Encoder | undefined
    ) => {
      let current = wrapper === undefined ? text : wrapper.encode(text, random);

      for (const step of steps) {
        current = step.encode(current, random);
      }

      return current;
    };

    for (let index = 0; index < COMPOSED_CASES; index += 1) {
      const leak = random.pick(COMPOSABLE_LEAKS);

      const steps = Array.from({ length: random.between(1, 4) }, () =>
        random.pick(leak.encoders)
      );

      const wrapper =
        leak.wrappers.length === 0 || random.between(1, 2) === 1
          ? undefined
          : random.pick(leak.wrappers);

      const names = [...steps, ...(wrapper === undefined ? [] : [wrapper])]
        .map((step) => step.name)
        .join(" > ");

      const sensitive = compose(leak.value(random), steps, wrapper);

      const rules = rulesOf(leak.path, leak.document(sensitive));

      if (!leak.rules.every((rule) => rules.includes(rule))) {
        missed.push(
          `seed ${COMPOSED_SEED} case ${index} ${leak.name} [${names}]: ${sensitive}`
        );
      }

      const twinStepNames = steps.filter((step) => step.name !== "tag-between");

      const twin = compose(
        leak.twin(random),
        twinStepNames,
        wrapper?.name === "href-attribute" ? wrapper : undefined
      );

      if (rulesOf(leak.path, leak.twinDocument(twin)).length > 0) {
        noisy.push(
          `seed ${COMPOSED_SEED} case ${index} ${leak.name} [${names}]: ${twin}`
        );
      }
    }

    expect({ missed, noisy }).toEqual({ missed: [], noisy: [] });
  }, 240_000);

  it("reads a leak through a decoder that runs to a fixed point", () => {
    expect(decodeText("%26%2364%3B").text.text).toBe("@");

    expect(decodeText("GB82<br>WEST").text.text).toBe("GB82WEST");

    expect(decodeText("\\u0040").text.text).toBe("@");

    expect(decodeText(decodeText(VERIFIER_IBAN).text.text).settled).toBe(true);
  });
});

const pad = (value: number) => String(value).padStart(2, "0");

const makeDate = (random: Random) => {
  const year = random.digits(4);

  const month = pad(random.between(1, 12));

  const day = pad(random.between(1, 28));

  return random.pick([
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${year}.${month}.${day}`,
    `${day}/${month}/${year}`,
    `${day}.${month}.${year}`,
    `${day}-${month}-${year}`,
    `${month}/${day}/${year}`,
  ]);
};

const makeClock = (random: Random) =>
  `${pad(random.between(0, 23))}:${pad(random.between(0, 59))}:${pad(random.between(0, 59))}`;

const makeTimestamp = (random: Random) => {
  const date = makeDate(random);

  const clock = makeClock(random);

  return random.pick([
    `${date}T${clock}`,
    `${date} ${clock}`,
    `${date}T${clock}Z`,
    `${date}T${clock}+01:00`,
    `${date}T${clock}.${random.digits(3)}Z`,
    clock,
  ]);
};

const makePhone = (random: Random) =>
  random.pick([
    `+44 7${random.digits(3)} ${random.digits(6)}`,
    `07${random.digits(3)} ${random.digits(6)}`,
    `(0${random.digits(2)}) ${random.digits(4)} ${random.digits(4)}`,
    `+1-${random.digits(3)}-${random.digits(3)}-${random.digits(4)}`,
    `${random.digits(3)}-${random.digits(3)}-${random.digits(4)}`,
    `${random.digits(5)} ${random.digits(6)}`,
  ]);

const COUNTER_VALUES: readonly (readonly [
  string,
  (random: Random) => string,
])[] = [
  ["date", makeDate],
  ["timestamp", makeTimestamp],
  ["phone", makePhone],
];

const counterText = (value: string, account: string, random: Random) =>
  random.pick([
    `${value}\t${account}`,
    `${account}\t${value}`,
    `${value}, ${account}`,
    `${account}; ${value}`,
    `${value} | ${account}`,
    `${value}\n  ${account}`,
    `Recorded at ${value}, paid into account ${account}.`,
  ]);

describe("a date, a timestamp or a phone number is never read as a bank pair", () => {
  it(`keeps ${CASES * 5} seeded records of each kind quiet`, () => {
    const paired: string[] = [];

    for (const [kind, [label, make]] of COUNTER_VALUES.entries()) {
      const random = makeRandom(SEED + 11 + kind);

      for (let index = 0; index < CASES * 5; index += 1) {
        const text = counterText(make(random), random.digits(8), random);

        if (rulesOf("docs/payments.md", text).includes("bank-account")) {
          paired.push(`${label}: ${text}`);
        }
      }
    }

    expect(paired).toEqual([]);
  }, 30_000);
});

const GITLEAKS = spawnSync("gitleaks", ["version"]).status === 0;

const GITLEAKS_CONFIG = path.resolve(
  import.meta.dirname,
  "..",
  ".gitleaks.toml"
);

const Finding = Schema.Struct({
  RuleID: Schema.String,
  StartLine: Schema.Finite,
});

const decodeFindings = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Array(Finding))
);

const scanForTokens = (lines: readonly string[]) => {
  const subject = mkdtempSync(path.join(tmpdir(), "personal-data-jwt-"));

  const reports = mkdtempSync(path.join(tmpdir(), "personal-data-jwt-report-"));

  const report = path.join(reports, "report.json");

  writeFileSync(path.join(subject, "note.md"), `${lines.join("\n")}\n`);

  try {
    spawnSync("gitleaks", [
      "dir",
      subject,
      "--config",
      GITLEAKS_CONFIG,
      "--report-format",
      "json",
      "--report-path",
      report,
      "--exit-code",
      "0",
      "--no-banner",
    ]);

    const text = readFileSync(report, "utf-8");

    return decodeFindings(text.trim().length === 0 ? "[]" : text);
  } finally {
    rmSync(subject, { force: true, recursive: true });
    rmSync(reports, { force: true, recursive: true });
  }
};

const FIXTURE_JWT = [
  "eyJhbGciOiJIUzI1NiJ9",
  "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
  "signatureValue",
].join(".");

const madeUpJwt = (random: Random) =>
  [
    `ey${random.alphanumeric(20)}`,
    `ey${random.alphanumeric(20)}`,
    random.alphanumeric(24),
  ].join(".");

const JWT_SEPARATORS = [" ", ",", ".", "(", ")", '"', "'"];

describe("a made-up JWT beside the exempt crash-test fixture is reported", () => {
  it.skipIf(!GITLEAKS)(`gitleaks reports ${CASES} seeded placements`, () => {
    const random = makeRandom(SEED + 3);

    const lines: string[] = [];

    const reported: number[] = [];

    const exempt: number[] = [];

    for (let index = 0; index < CASES; index += 1) {
      const separator = random.pick(JWT_SEPARATORS);

      const token = madeUpJwt(random);

      const lead = random.prose(2);

      const placement =
        random.between(1, 2) === 1
          ? [`${lead} ${FIXTURE_JWT}${separator}${token}`]
          : [`${lead} ${FIXTURE_JWT}${separator}`, token];

      lines.push(...placement);

      reported.push(lines.length);

      const tail = random.prose(2);

      lines.push(`${lead} ${FIXTURE_JWT}${separator}${tail}`);

      exempt.push(lines.length);
    }

    const findings = scanForTokens(lines);

    const tokens = findings.filter((finding) => finding.RuleID === "jwt");

    const reportedLines = new Set(tokens.map((finding) => finding.StartLine));

    const missing = reported.filter((line) => !reportedLines.has(line));

    const excused = exempt.filter((line) => reportedLines.has(line));

    expect({ excused, missing, tokens: tokens.length }).toEqual({
      excused: [],
      missing: [],
      tokens: reported.length,
    });
  });

  it.runIf(!GITLEAKS)("skipped: gitleaks is not installed", () => {
    expect(GITLEAKS).toBe(false);
  });
});

const CO_AUTHOR_KEYS = [
  "Co-authored-by",
  "co-authored-by",
  "CO-AUTHORED-BY",
  "Co_Authored_By",
  "Co Authored By",
  "Co-authored-By",
  "CO_AUTHORED_BY",
];

const CO_AUTHOR_MAILBOXES: readonly (readonly [string, string])[] = [
  ["ada", "acme.test"],
  ['"jane doe"', "acme.test"],
  ["bj\u00F6rn", "b\u00FCcher.test"],
  ["jose\u0301", "bu\u0308cher.test"],
  [
    "\u03B4\u03BF\u03BA\u03B9\u03BC\u03AE",
    "\u03C0\u03B1\u03C1\u03AC\u03B4\u03B5\u03B9\u03B3\u03BC\u03B1.test",
  ],
  ["Ada.Lovelace", "ACME.CO.UK"],
  ["jane+finance", "acme.test"],
];

const BODY_CONTROLS = [
  "\u0001",
  "\u0007",
  "\u0008",
  "\u000B",
  "\u000C",
  "\u000E",
  "\u001B",
  "\u001E",
  "\u001F",
  "\r",
  "\u0085",
  "\u200B",
  "\uFEFF",
];

const CO_AUTHOR_COMMIT = "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c";

const PLACEMENTS = [
  "prose",
  "line-ending",
  "trailer-start",
  "before-address",
] as const;

const coAuthorBody = (
  placement: string,
  control: string,
  key: string,
  address: string
) => {
  if (placement === "line-ending") {
    return `Subject${control}\n\n${key}: Ada <${address}>${control}\n`;
  }

  if (placement === "trailer-start") {
    return `Subject\n\n${control}${key}: Ada <${address}>\n`;
  }

  if (placement === "before-address") {
    return `Subject\n\n${key}: Ada ${control}<${address}>\n`;
  }

  return `Subject\n\nA change${control}worth noting.\n\n${key}: Ada <${address}>\n`;
};

const coAuthorOffenders = (body: string) =>
  identityOffenders(
    withCoAuthors(
      parseIdentityLog(
        `${CO_AUTHOR_COMMIT}\tnoreply@github.com\tnoreply@github.com\n`
      ),
      [{ body, commit: CO_AUTHOR_COMMIT }]
    )
  ).filter((offender) => offender.field === "co-author");

describe("a co-author trailer is read through any control character and address shape", () => {
  it(`reads and judges ${CASES} seeded trailers`, () => {
    const random = makeRandom(SEED + 4);

    const missed: string[] = [];

    for (let index = 0; index < CASES; index += 1) {
      const [local, domain] = random.pick(CO_AUTHOR_MAILBOXES);

      const address = `${local}@${domain}`;

      const body = coAuthorBody(
        random.pick(PLACEMENTS),
        random.pick(BODY_CONTROLS),
        random.pick(CO_AUTHOR_KEYS),
        address
      );

      const extracted = coAuthorEmailsIn(body).map((found) =>
        found.toLowerCase()
      );

      const judged = coAuthorOffenders(body);

      if (!extracted.includes(address.toLowerCase()) || judged.length !== 1) {
        missed.push(body);
      }
    }

    expect(missed).toEqual([]);
  });
});
