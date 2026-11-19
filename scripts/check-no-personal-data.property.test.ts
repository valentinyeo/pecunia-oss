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

const readsAsYear = (group: string) => {
  const value = Number(group);

  return value >= 1900 && value <= 2099;
};

const accountGroup = (random: Random) => {
  let group = random.digits(4);

  while (readsAsYear(group)) {
    group = random.digits(4);
  }

  return group;
};

const accountValue = (random: Random) =>
  inNumber([accountGroup(random), accountGroup(random)], random);

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
    harmless: (random) =>
      asCodePointEscapes(`const id = "${accountIdValue(random)}";`),
    name: "cloudflare-account-id",
    path: "apps/cli/src/ids.ts",
    sensitive: (random) => asCodePointEscapes(accountIdDocument(random)),
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

const percentByte = (byte: number) =>
  `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;

const percentOf = (text: string) =>
  [...new TextEncoder().encode(text)].map(percentByte).join("");

const UNRESERVED = /^[A-Za-z0-9\-._~]$/u;

const percentLine = (line: string) =>
  [...new TextEncoder().encode(line)]
    .map((byte) => {
      const character = String.fromCodePoint(byte);

      return UNRESERVED.test(character) ? character : percentByte(byte);
    })
    .join("");

const inEntityForm = (text: string) =>
  text.replaceAll(
    /[^A-Za-z0-9]/gu,
    (character) => `&#${String(character.codePointAt(0) ?? 0)};`
  );

const asJsonString = (text: string) => JSON.stringify(text).slice(1, -1);

const asPercent = (text: string) =>
  text.split("\n").map(percentLine).join("\n");

const FORM_UNRESERVED = /^[A-Za-z0-9*\-._]$/u;

const formLine = (line: string) =>
  [...new TextEncoder().encode(line)]
    .map((byte) => {
      const character = String.fromCodePoint(byte);

      if (character === " ") {
        return "+";
      }

      return FORM_UNRESERVED.test(character) ? character : percentByte(byte);
    })
    .join("");

const asForm = (text: string) => text.split("\n").map(formLine).join("\n");

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

const QUOTED_PRINTABLE_PIECE = (byte: number) =>
  `=${byte.toString(16).toUpperCase().padStart(2, "0")}`;

const HEX_START = /^[0-9A-Fa-f]/u;

const quotedPrintableLine = (line: string, width = 75) => {
  const bytes = [...new TextEncoder().encode(line)];

  const pieces = bytes.map((byte, index) => {
    const last = index === bytes.length - 1;

    const plain =
      byte >= 33 &&
      byte <= 126 &&
      byte !== 61 &&
      !((byte === 32 || byte === 9) && last);

    return plain ? String.fromCodePoint(byte) : QUOTED_PRINTABLE_PIECE(byte);
  });

  const wrapped: string[] = [];

  let current = "";

  for (const piece of pieces) {
    if (current.length + piece.length > width && !HEX_START.test(piece)) {
      wrapped.push(`${current}=`);

      current = "";
    }

    current += piece;
  }

  wrapped.push(current);

  return wrapped.join("\r\n");
};

const asQuotedPrintable = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replaceAll("\r", ""))
    .map((line) => quotedPrintableLine(line))
    .join("\r\n");

const BASE64_MINIMUM = 16;

const MIME_LINE = 76;

const wrapAt = (encoded: string, width: number) => {
  const lines: string[] = [];

  for (let index = 0; index < encoded.length; index += width) {
    lines.push(encoded.slice(index, index + width));
  }

  return lines.join("\r\n");
};

const asMimeBase64 = (text: string) => {
  const encoded = Buffer.from(text, "utf-8").toString("base64");

  return encoded.length < BASE64_MINIMUM ? text : wrapAt(encoded, MIME_LINE);
};

const asBase64 = (text: string) => {
  const encoded = Buffer.from(text, "utf-8").toString("base64");

  return encoded.length < BASE64_MINIMUM ? text : encoded;
};

const asBase64Url = (text: string) => {
  const encoded = Buffer.from(text, "utf-8").toString("base64url");

  return encoded.length < BASE64_MINIMUM ? text : encoded;
};

const asCodePointEscapes = (text: string) =>
  text.replaceAll(/[0-9]/gu, (digit) => `\\u003${digit}`);

const EMPHASIS_MARKERS = ["**", "__", "~~", "`"];

const withEmphasis = (text: string, random: Random) => {
  const parts = text.split(" ");

  return parts
    .map((part) =>
      part.length === 0 || random.between(1, 3) !== 1
        ? part
        : `${random.pick(EMPHASIS_MARKERS)}${part}${random.pick(EMPHASIS_MARKERS)}`
    )
    .join(" ");
};

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
  { encode: asQuotedPrintable, name: "quoted-printable" },
  { encode: asMimeBase64, name: "mime-base64" },
  { encode: asBase64, name: "base64" },
  { encode: asBase64Url, name: "base64-url" },
  { encode: withEmphasis, name: "emphasis" },
];

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

const SPEC_ENCODERS: readonly Encoder[] = COMPOSABLE_ENCODERS.filter(
  (encoder) =>
    !["identity", "tag-between", "href-attribute", "emphasis"].includes(
      encoder.name
    )
);

const filler = (random: Random) => random.prose(random.between(0, 60));

const encodersExcept = (...names: readonly string[]) =>
  SPEC_ENCODERS.filter((encoder) => !names.includes(encoder.name));

const FILE_ENCODERS = encodersExcept("quoted-printable");

const MAIL_ENCODERS = SPEC_ENCODERS;

const TEXT_ENCODERS = encodersExcept(
  "quoted-printable",
  "mime-base64",
  "base64",
  "base64-url"
);

const reference = (random: Random) =>
  `${filler(random)} payment reference ${random.alphanumeric(6)} ${filler(random)}`;

const plainSortCode = (random: Random) =>
  `${random.digits(2)}-${random.digits(2)}-${random.digits(2)}`;

const plainAccount = (random: Random) =>
  accountGroup(random) + accountGroup(random);

const plainEmail = (random: Random) =>
  `${random.pick(EMAIL_LOCALS)}@${random.pick(EMAIL_DOMAINS)}`;

const HEX = "0123456789abcdef";

const plainAccountId = (random: Random) =>
  Array.from({ length: 32 }, () => random.pick(HEX.split(""))).join("");

interface Planted {
  readonly path: string;
  readonly text: string;
}

interface ContainerLeak {
  readonly encoders: readonly Encoder[];
  readonly name: string;
  readonly plant: (random: Random) => Planted;
  readonly rules: readonly RuleId[];
  readonly twin: (random: Random) => Planted;
}

const CONTAINER_LEAKS: readonly ContainerLeak[] = [
  {
    encoders: FILE_ENCODERS,
    name: "env-file",
    plant: (random) => ({
      path: "apps/cli/.env.demo",
      text: [
        "DEMO_MODE=on",
        `SORT_CODE=${plainSortCode(random)}`,
        `PAYMENT_REFERENCE=${reference(random)}`,
        `ACCOUNT_NUMBER=${plainAccount(random)}`,
        "REGION=demo",
      ].join("\n"),
    }),
    rules: ["bank-account"],
    twin: (random) => ({
      path: "apps/cli/.env.demo",
      text: [
        "DEMO_MODE=on",
        `SORT_CODE=${plainSortCode(random)}`,
        `PAYMENT_REFERENCE=${reference(random)}`,
        "REGION=demo",
      ].join("\n"),
    }),
  },
  {
    encoders: MAIL_ENCODERS,
    name: "mime-mail",
    plant: (random) => ({
      path: "docs/mail-export.md",
      text: [
        "From: Demo Sender <demo@example.com>",
        'Content-Type: text/plain; charset="utf-8"',
        "Content-Transfer-Encoding: quoted-printable",
        "",
        `${filler(random)} Contact ${plainEmail(random)} before Friday. ${filler(random)}`,
      ].join("\n"),
    }),
    rules: ["email"],
    twin: (random) => ({
      path: "docs/mail-export.md",
      text: [
        "From: Demo Sender <demo@example.com>",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        `${filler(random)} Contact ${random.pick(mailboxNames)}@${random.pick(PLACEHOLDER_DOMAINS)} before Friday.`,
      ].join("\n"),
    }),
  },
  {
    encoders: FILE_ENCODERS,
    name: "yaml-record",
    plant: (random) => ({
      path: "apps/cli/demo.yaml",
      text: [
        "payment:",
        `  sort_code: ${plainSortCode(random)}`,
        `  reference: ${reference(random)}`,
        `  account_number: ${plainAccount(random)}`,
        "  currency: GBP",
      ].join("\n"),
    }),
    rules: ["bank-account"],
    twin: (random) => ({
      path: "apps/cli/demo.yaml",
      text: [
        "payment:",
        `  sort_code: ${plainSortCode(random)}`,
        "  currency: GBP",
      ].join("\n"),
    }),
  },
  {
    encoders: FILE_ENCODERS,
    name: "csv-row",
    plant: (random) => ({
      path: "packages/bank-import/fixtures/demo.csv",
      text: [
        "sort_code,reference,account_number",
        `${plainSortCode(random)},${reference(random).replaceAll(",", " ")},${plainAccount(random)}`,
      ].join("\n"),
    }),
    rules: ["bank-account"],
    twin: (random) => ({
      path: "packages/bank-import/fixtures/demo.csv",
      text: [
        "sort_code,reference,account_number",
        `${plainSortCode(random)},demo reference,`,
      ].join("\n"),
    }),
  },
  {
    encoders: TEXT_ENCODERS,
    name: "url-query",
    plant: (random) => ({
      path: "docs/payments.md",
      text: `Pay at https://demo.example/pay?iban=${percentOf(ibanValue(random))}&note=demo before Friday.`,
    }),
    rules: ["iban"],
    twin: (random) => ({
      path: "docs/payments.md",
      text: `Pay at https://demo.example/pay?iban=${percentOf(nonChecksumIban(random))}&note=demo before Friday.`,
    }),
  },
  {
    encoders: TEXT_ENCODERS,
    name: "json-document",
    plant: (random) => ({
      path: "apps/cli/demo.json",
      text: `{"account_id":${JSON.stringify(plainAccountId(random))},"region":"demo"}`,
    }),
    rules: ["cloudflare-account-id"],
    twin: (random) => ({
      path: "docs/notes.md",
      text: `A made-up hash in prose, not an id: ${plainAccountId(random)}.`,
    }),
  },
  {
    encoders: TEXT_ENCODERS,
    name: "json-iban",
    plant: (random) => ({
      path: "apps/cli/demo.json",
      text: `{"payments":[{"iban":${JSON.stringify(ibanValue(random))},"label":"demo"}]}`,
    }),
    rules: ["iban"],
    twin: (random) => ({
      path: "apps/cli/demo.json",
      text: `{"payments":[{"iban":${JSON.stringify(nonChecksumIban(random))},"label":"demo"}]}`,
    }),
  },
  {
    encoders: FILE_ENCODERS,
    name: "quoted-mailbox-env",
    plant: (random) => ({
      path: "apps/cli/.env.demo",
      text: [
        `DEMO_MODE=on`,
        `BILLING_CONTACT=${quotedMailbox(random)}`,
        "REGION=demo",
      ].join("\n"),
    }),
    rules: ["email"],
    twin: (random) => ({
      path: "apps/cli/.env.demo",
      text: [
        `DEMO_MODE=on`,
        `BILLING_CONTACT=${placeholderMailbox(random)}`,
        "REGION=demo",
      ].join("\n"),
    }),
  },
  {
    encoders: FILE_ENCODERS,
    name: "block-scalar-yaml",
    plant: (random) => ({
      path: "apps/infra/wrangler.yaml",
      text: [
        "services:",
        "  demo:",
        "    CLOUDFLARE_API_TOKEN: |-",
        `      ${secretValue(random)}`,
      ].join("\n"),
    }),
    rules: ["secret-block-scalar"],
    twin: () => ({
      path: "apps/infra/wrangler.yaml",
      text: [
        "services:",
        "  demo:",
        "    CLOUDFLARE_API_TOKEN: |-",
        "      read-from-the-environment",
      ].join("\n"),
    }),
  },
];

const MAX_STEPS = 1;

const LAYERED_ENCODERS = new Set(["base64", "base64-url"]);

describe("a planted value survives a real encoder in an ordinary container", () => {
  it(`reads ${COMPOSED_CASES} seeded containers and keeps every twin quiet`, () => {
    const random = makeRandom(COMPOSED_SEED);

    const missed: string[] = [];

    const noisy: string[] = [];

    const compose = (text: string, steps: readonly Encoder[]) => {
      let current = text;

      for (const step of steps) {
        current = step.encode(current, random);
      }

      return current;
    };

    for (let index = 0; index < COMPOSED_CASES; index += 1) {
      const leak = random.pick(CONTAINER_LEAKS);

      const steps: Encoder[] = [];

      for (let count = random.between(0, MAX_STEPS); count > 0; count -= 1) {
        const pool = leak.encoders.filter(
          (encoder) =>
            !LAYERED_ENCODERS.has(encoder.name) ||
            !steps.some((step) => LAYERED_ENCODERS.has(step.name))
        );

        steps.push(random.pick(pool));
      }

      const names = steps.map((step) => step.name).join(" > ");

      const planted = leak.plant(random);

      const sensitive = compose(planted.text, steps);

      const rules = rulesOf(planted.path, sensitive);

      if (!leak.rules.every((rule) => rules.includes(rule))) {
        missed.push(
          `seed ${COMPOSED_SEED} case ${index} ${leak.name} [${names}]: ${sensitive}`
        );
      }

      const twin = leak.twin(random);

      const twinText = compose(twin.text, steps);

      if (rulesOf(twin.path, twinText).length > 0) {
        noisy.push(
          `seed ${COMPOSED_SEED} case ${index} ${leak.name} [${names}]: ${twinText}`
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

const CONTAINER_SEED = SEED + 24_190;

const CONTAINER_WRAP_CASES = 1500;

const LINE_ENDINGS = ["\n", "\r\n", "\r"] as const;

const payloadLines = (payload: string) =>
  payload.replaceAll(/\r\n|\r|\n/gu, "\n").split("\n");

const indentedLines = (lines: readonly string[], indent: number) =>
  lines.map((line) => `${" ".repeat(indent)}${line}`);

const asSoftWrappedQuotedPrintable = (text: string, random: Random) =>
  text
    .split("\n")
    .map((line) => line.replaceAll("\r", ""))
    .map((line) => quotedPrintableLine(line, random.between(20, MIME_LINE)))
    .join("\r\n")
    .replace(/[=]$/u, "");

const asWrappedMimeBase64 = (text: string, random: Random) => {
  const encoded = Buffer.from(text, "utf-8").toString("base64");

  return encoded.length < 24 ? text : wrapAt(encoded, random.between(24, 76));
};

const CONTAINER_ENCODERS: readonly Encoder[] = [
  { encode: asJsonString, name: "json-string" },
  { encode: inEntityForm, name: "html-entity" },
  { encode: asPercent, name: "percent" },
  { encode: asSoftWrappedQuotedPrintable, name: "quoted-printable" },
  { encode: asWrappedMimeBase64, name: "mime-base64" },
];

interface ContainerWrap {
  readonly name: string;
  readonly wrap: (payload: string, indent: number, ending: string) => string;
}

const CONTAINER_WRAPS: readonly ContainerWrap[] = [
  {
    name: "yaml-block-scalar",
    wrap: (payload, indent, ending) =>
      [
        "record:",
        "  mail_body: |",
        ...indentedLines(payloadLines(payload), indent),
      ].join(ending),
  },
  {
    name: "yaml-folded-scalar",
    wrap: (payload, indent, ending) =>
      [
        "record:",
        "  mail_body: >",
        ...indentedLines(payloadLines(payload), indent),
      ].join(ending),
  },
  {
    name: "mail-reply",
    wrap: (payload, indent, ending) =>
      payloadLines(payload)
        .map((line) => `${" ".repeat(indent)}> ${line}`)
        .join(ending),
  },
  {
    name: "mail-reply-nested",
    wrap: (payload, indent, ending) =>
      payloadLines(payload)
        .map((line) => `${" ".repeat(indent)}>> ${line}`)
        .join(ending),
  },
  {
    name: "shell-heredoc",
    wrap: (payload, indent, ending) =>
      [
        `${" ".repeat(indent)}cat > note.txt <<'EOF'`,
        ...indentedLines(payloadLines(payload), indent),
        `${" ".repeat(indent)}EOF`,
      ].join(ending),
  },
  {
    name: "markdown-list-item",
    wrap: (payload, indent, ending) => {
      const [first = "", ...rest] = payloadLines(payload);

      return [
        `${" ".repeat(indent)}- ${first}`,
        ...indentedLines(rest, indent + 2),
      ].join(ending);
    },
  },
  {
    name: "code-comment",
    wrap: (payload, indent, ending) =>
      payloadLines(payload)
        .map((line) => `${" ".repeat(indent)}# ${line}`)
        .join(ending),
  },
  {
    name: "json-string",
    wrap: (payload, indent, ending) => {
      const pad = " ".repeat(indent);

      return [
        `${pad}{"record":{"body":${JSON.stringify(payloadLines(payload).join("\n"))},`,
        `${pad}"note":"demo"}}`,
      ].join(ending);
    },
  },
  {
    name: "csv-quoted-cell",
    wrap: (payload, indent, ending) => {
      const [first = "", ...rest] = payloadLines(payload);

      const pad = " ".repeat(indent);

      return [
        `${pad}note,body`,
        `${pad}demo,"${first}`,
        ...indentedLines(rest, indent),
      ]
        .join(ending)
        .concat('"');
    },
  },
];

const WRAP_NAMES = [
  "code-comment",
  "csv-quoted-cell",
  "json-string",
  "mail-reply",
  "mail-reply-nested",
  "markdown-list-item",
  "shell-heredoc",
  "yaml-block-scalar",
  "yaml-folded-scalar",
];

const longFiller = (random: Random) => {
  const words = random.between(0, 220);

  return words === 0 ? "" : random.prose(words);
};

const surrounded = (
  wrapped: string,
  random: Random,
  ending: string
): string => {
  const before = longFiller(random);

  const after = longFiller(random);

  return [before, wrapped, after]
    .filter((part) => part.length > 0)
    .join(ending)
    .concat(ending);
};

interface Twin {
  readonly encode: boolean;
  readonly name: string;
  readonly text: string;
}

const base64Prose = (random: Random) =>
  Buffer.from(random.prose(random.between(2, 6)), "utf-8").toString("base64");

const TWINS: readonly ((random: Random) => Twin)[] = [
  (random) => ({ encode: true, name: "date", text: makeDate(random) }),
  (random) => ({ encode: true, name: "clock", text: makeClock(random) }),
  (random) => ({ encode: true, name: "phone", text: makePhone(random) }),
  (random) => ({
    encode: true,
    name: "amount",
    text: `total ${random.digits(random.between(3, 7))}.${random.digits(2)}`,
  }),
  (random) => ({
    encode: true,
    name: "sort-code",
    text: `sort code ${sortCodeValue(random)}`,
  }),
  (random) => ({
    encode: false,
    name: "base64-prose",
    text: base64Prose(random),
  }),
];

const twinsIn = (encoderName: string) =>
  encoderName === "quoted-printable"
    ? TWINS.filter((_, index) => index !== 2)
    : TWINS;

interface ContainerKind {
  readonly covers: readonly RuleId[];
  readonly name: string;
  readonly path: string;
  readonly value: (random: Random) => string;
}

const CONTAINER_KINDS: readonly ContainerKind[] = [
  {
    covers: ["email"],
    name: "email",
    path: "docs/mail-export.md",
    value: (random) =>
      `${random.pick(EMAIL_LOCALS)}@${random.pick(EMAIL_DOMAINS)}`,
  },
  {
    covers: ["iban"],
    name: "iban",
    path: "docs/payments.md",
    value: (random) => ibanValue(random).replaceAll(/[^A-Za-z0-9]/gu, ""),
  },
  {
    covers: ["cloudflare-account-id"],
    name: "cloudflare-account-id",
    path: "apps/cli/demo.yaml",
    value: (random) => `account_id: ${accountIdValue(random)}`,
  },
  {
    covers: ["bank-account"],
    name: "bank-pair",
    path: "apps/cli/demo.yaml",
    value: (random) =>
      `sort code ${plainSortCode(random)} account number ${plainAccount(random)} end`,
  },
];

describe("a container around an encoded value is stripped before it is read", () => {
  it("declares every container shape the class names", () => {
    expect(CONTAINER_WRAPS.map((wrap) => wrap.name).toSorted()).toEqual(
      WRAP_NAMES
    );

    expect(
      CONTAINER_ENCODERS.map((encoder) => encoder.name).toSorted()
    ).toEqual([
      "html-entity",
      "json-string",
      "mime-base64",
      "percent",
      "quoted-printable",
    ]);
  });

  it.each([2, 4, 8])(
    "reads a soft-broken address and a wrapped base64 address under %d spaces of a block scalar",
    (indent) => {
      const local = makeRandom(indent);

      const mailbox = `${local.alphanumeric(6).toLowerCase()}@${EMAIL_DOMAINS[indent % EMAIL_DOMAINS.length] ?? "acme.com"}`;

      const softBroken = asSoftWrappedQuotedPrintable(
        mailbox,
        makeRandom(SEED)
      );

      const wrapped = asWrappedMimeBase64(
        `Invoice recipient contact: ${mailbox}`,
        makeRandom(SEED)
      );

      for (const payload of [softBroken, wrapped]) {
        for (const ending of LINE_ENDINGS) {
          const text = [
            "record:",
            "  mail_body: |",
            ...indentedLines(payloadLines(payload), indent),
          ].join(ending);

          expect(rulesOf("docs/mail-export.md", text)).toContain("email");
        }
      }
    }
  );

  it(`reads ${CONTAINER_WRAP_CASES} seeded containers and keeps every twin quiet`, () => {
    const random = makeRandom(CONTAINER_SEED);

    const missed: {
      readonly case: string;
      readonly rules: readonly string[];
      readonly text: string;
    }[] = [];

    const noisy: {
      readonly case: string;
      readonly rules: readonly string[];
      readonly text: string;
    }[] = [];

    for (let index = 0; index < CONTAINER_WRAP_CASES; index += 1) {
      const kind = random.pick(CONTAINER_KINDS);

      const encoder = random.pick(CONTAINER_ENCODERS);

      const wrap = random.pick(CONTAINER_WRAPS);

      const indent =
        random.between(1, 4) === 1
          ? random.pick([2, 4, 8])
          : random.between(0, 12);

      const ending = random.pick(LINE_ENDINGS);

      const encoded = encoder.encode(kind.value(random), random);

      const document = surrounded(
        wrap.wrap(encoded, indent, ending),
        random,
        ending
      );

      const rules = rulesOf(kind.path, document);

      const label = `seed ${CONTAINER_SEED} case ${index} ${kind.name} ${encoder.name} in ${wrap.name} indent ${indent} ending ${JSON.stringify(ending)}`;

      if (!kind.covers.every((rule) => rules.includes(rule))) {
        missed.push({ case: label, rules, text: document });
      }

      const twin = random.pick(twinsIn(encoder.name))(random);

      const twinEncoded = twin.encode
        ? encoder.encode(twin.text, random)
        : twin.text;

      const twinDocument = surrounded(
        wrap.wrap(twinEncoded, indent, ending),
        random,
        ending
      );

      if (rulesOf(kind.path, twinDocument).length > 0) {
        noisy.push({
          case: label,
          rules: rulesOf(kind.path, twinDocument),
          text: twinDocument,
        });
      }
    }

    writeFileSync(
      "/tmp/container-cases.json",
      JSON.stringify({ missed, noisy }, null, 1)
    );

    expect({ missed, noisy }).toEqual({ missed: [], noisy: [] });
  }, 240_000);
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

const PREFIX_SEED = SEED + 42_424;

const PREFIX_CASES = 1600;

const ASCII_PUNCTUATION = Array.from({ length: 94 }, (_, index) =>
  String.fromCodePoint(33 + index)
).filter((character) => !/[A-Za-z0-9]/u.test(character));

const CONTAINER_PREFIXES: readonly string[] = [
  ...ASCII_PUNCTUATION.map((character) => `${character} `),
  " ",
  "\t",
  "> ",
  ">> ",
  "> > ",
  "+ ",
  "- ",
  "| a | b | ",
  "// ",
  "# ",
  "1. ",
  "2) ",
];

const asEscapedPayload = (text: string) =>
  text.replaceAll(/[^A-Za-z0-9]/gu, (character) => {
    const code = (character.codePointAt(0) ?? 0).toString(16).padStart(4, "0");

    return `\\u${code}`;
  });

interface PayloadKind {
  readonly name: string;
  readonly path: string;
  readonly rules: readonly RuleId[];
  readonly text: (random: Random) => string;
}

const PREFIX_PAYLOADS: readonly PayloadKind[] = [
  {
    name: "address",
    path: "docs/mail-export.md",
    rules: ["email"],
    text: (random) =>
      `${random.pick(EMAIL_LOCALS)}@${random.pick(EMAIL_DOMAINS)}`,
  },
  {
    name: "iban",
    path: "docs/payments.md",
    rules: ["iban"],
    text: (random) => ibanValue(random).replaceAll(/[^A-Za-z0-9]/gu, ""),
  },
  {
    name: "account-id",
    path: "apps/cli/demo.yaml",
    rules: ["cloudflare-account-id"],
    text: (random) => `account_id: ${accountIdValue(random)}`,
  },
  {
    name: "bank-pair",
    path: "apps/cli/demo.yaml",
    rules: ["bank-account"],
    text: (random) =>
      `sort code ${plainSortCode(random)} account number ${plainAccount(random)} end`,
  },
];

interface DecoderWrap {
  readonly encode: (text: string, random: Random) => string;
  readonly name: string;
}

const DECODER_WRAPS: readonly DecoderWrap[] = [
  { encode: withZeroWidth, name: "zero-width" },
  { encode: asFullWidth, name: "fold" },
  { encode: asEscapedPayload, name: "json-escape" },
  { encode: inEntityForm, name: "entity" },
  { encode: asPercent, name: "percent" },
  { encode: asSoftWrappedQuotedPrintable, name: "quoted-printable" },
  { encode: asWrappedMimeBase64, name: "base64" },
  { encode: asForm, name: "form-plus" },
  { encode: withTags, name: "tag" },
];

const layered = (
  encoded: string,
  prefixes: readonly string[],
  indents: readonly number[],
  ending: string
) => {
  let lines = payloadLines(encoded);

  for (const [layer, prefix] of prefixes.entries()) {
    const indent = " ".repeat(indents[layer] ?? 0);

    lines = lines.map((line) => `${indent}${prefix}${line}`);
  }

  return lines.join(ending);
};

const labelled = (
  index: number,
  kind: string,
  wrap: string,
  prefixes: readonly string[],
  indents: readonly number[],
  ending: string
) =>
  `seed ${PREFIX_SEED} case ${index} ${kind} ${wrap} prefixes ${JSON.stringify(prefixes)} indents ${JSON.stringify(indents)} ending ${JSON.stringify(ending)}`;

describe("a container prefix is read by what it is not, not from a list", () => {
  it(`reads ${PREFIX_CASES} seeded prefix stacks over every decoder`, () => {
    const random = makeRandom(PREFIX_SEED);

    const missed: string[] = [];

    for (let index = 0; index < PREFIX_CASES; index += 1) {
      const kind = random.pick(PREFIX_PAYLOADS);

      const wrap = random.pick(DECODER_WRAPS);

      const ending = random.pick(LINE_ENDINGS);

      const depth = random.between(0, 4);

      const prefixes = Array.from({ length: depth }, () =>
        random.pick(CONTAINER_PREFIXES)
      );

      const indents = Array.from({ length: depth }, () => random.between(0, 8));

      const encoded = wrap.encode(kind.text(random), random);

      const document = layered(encoded, prefixes, indents, ending);

      const rules = rulesOf(kind.path, document);

      if (!kind.rules.every((rule) => rules.includes(rule))) {
        missed.push(
          `${labelled(index, kind.name, wrap.name, prefixes, indents, ending)}: ${document}`
        );
      }
    }

    expect(missed).toEqual([]);
  }, 300_000);

  const HARMLESS_SEED = SEED + 909_090;

  const HARMLESS_CASES = 600;

  const HARMLESS_SPLITS: readonly {
    readonly build: (sort: string, account: string) => string;
    readonly name: string;
    readonly path: string;
  }[] = [
    {
      build: (sort, account) =>
        [`sort_code: ${sort}`, "", `account_number: ${account}`].join("\n"),
      name: "blank-line-split",
      path: "apps/cli/demo.yaml",
    },
    {
      build: (sort, account) =>
        [
          "first:",
          `  sort_code: ${sort}`,
          "second:",
          `  account_number: ${account}`,
        ].join("\n"),
      name: "separate-entries",
      path: "apps/cli/demo.yaml",
    },
  ];

  const HARMLESS_VALUES: readonly {
    readonly name: string;
    readonly path: string;
    readonly text: (random: Random) => string;
  }[] = [
    {
      name: "sort-only",
      path: "docs/payments.md",
      text: (random) => `sort code ${plainSortCode(random)}`,
    },
    {
      name: "placeholder-mailbox",
      path: "docs/mail-export.md",
      text: (random) =>
        `${random.pick(mailboxNames)}@${random.pick(PLACEHOLDER_DOMAINS)}`,
    },
    {
      name: "non-checksum-iban",
      path: "docs/payments.md",
      text: (random) => nonChecksumIban(random),
    },
    {
      name: "example-hostname",
      path: "README.md",
      text: () => "example.pages.dev",
    },
  ];

  it(`keeps ${HARMLESS_CASES} seeded harmless values and split records quiet`, () => {
    const random = makeRandom(HARMLESS_SEED);

    const noisy: string[] = [];

    for (let index = 0; index < HARMLESS_CASES; index += 1) {
      const wrap = random.pick(DECODER_WRAPS);

      const ending = random.pick(LINE_ENDINGS);

      const split = random.pick([true, false]);

      const label = split
        ? random.pick(HARMLESS_SPLITS).name
        : random.pick(HARMLESS_VALUES).name;

      let documentPath = "docs/payments.md";

      let text = "";

      const encode =
        wrap.name === "tag"
          ? (value: string) => `<span title="a > b">${value}</span>`
          : wrap.encode;

      if (split) {
        const document = random.pick(HARMLESS_SPLITS);

        documentPath = document.path;

        text = document
          .build(
            encode(plainSortCode(random), random),
            encode(plainAccount(random), random)
          )
          .split("\n")
          .join(ending);
      } else {
        const document = random.pick(HARMLESS_VALUES);

        documentPath = document.path;

        const depth = random.between(0, 4);

        const prefixes = Array.from({ length: depth }, () =>
          random.pick(CONTAINER_PREFIXES)
        );

        const indents = Array.from({ length: depth }, () =>
          random.between(0, 8)
        );

        text = layered(
          encode(document.text(random), random),
          prefixes,
          indents,
          ending
        );
      }

      const rules = rulesOf(documentPath, text);

      if (rules.length > 0) {
        noisy.push(
          `${label} ${wrap.name} ${JSON.stringify(ending)} ${JSON.stringify(rules)}: ${text}`
        );
      }
    }

    expect(noisy).toEqual([]);
  }, 300_000);
});

const EVERY_READING_SEED = SEED + 807_080;

const EVERY_READING_CASES = 1560;

const EVERY_READING_HARMLESS = 640;

const DIFF_MARKERS = ["+", "-", " "] as const;

const tableRowOf = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;

const tableOf = (
  columns: number,
  at: number,
  lines: readonly string[]
): readonly string[] => [
  tableRowOf(
    Array.from({ length: columns }, (_, index) => `column ${index + 1}`)
  ),
  tableRowOf(Array.from({ length: columns }, () => "---")),
  ...lines.map((line) =>
    tableRowOf(
      Array.from({ length: columns }, (_, index) =>
        index === at ? line : "saved"
      )
    )
  ),
];

const diffOf = (
  marker: string,
  spaced: boolean,
  lines: readonly string[]
): readonly string[] => [
  `@@ -1,${lines.length} +1,${lines.length} @@`,
  ...lines.map((line) => `${marker}${spaced ? " " : ""}${line}`),
];

const everyReadingLabel = (
  seed: number,
  index: number,
  parts: readonly (string | number)[]
) => `seed ${seed} case ${index} ${parts.join(" ")}`;

const wrappedCase = (
  random: Random,
  text: string,
  encode: (value: string, random: Random) => string,
  endings: readonly string[]
) => {
  const lines = payloadLines(encode(text, random));

  const columns = random.between(2, 5);

  const at = random.pick([0, Math.floor((columns - 1) / 2), columns - 1]);

  const layout = random.pick(["table", "diff"] as const);

  const block =
    layout === "table"
      ? tableOf(columns, at, lines)
      : diffOf(random.pick(DIFF_MARKERS), random.pick([true, false]), lines);

  const depth = random.between(0, 3);

  const prefixes = Array.from({ length: depth }, () =>
    random.pick(CONTAINER_PREFIXES)
  );

  const indents = Array.from({ length: depth }, () => random.between(0, 8));

  const ending = random.pick(endings);

  return {
    document: layered(block.join("\n"), prefixes, indents, ending),
    label: [
      layout,
      `columns ${columns}`,
      `at ${at}`,
      `depth ${depth}`,
      `prefixes ${JSON.stringify(prefixes)}`,
      `indents ${JSON.stringify(indents)}`,
      `ending ${JSON.stringify(ending)}`,
    ],
  };
};

const HARMLESS_WRAPS = DECODER_WRAPS.filter(
  (wrap) => wrap.name !== "tag" && wrap.name !== "zero-width"
);

const HARMLESS_VALUES: readonly {
  readonly name: string;
  readonly path: string;
  readonly text: (random: Random) => string;
}[] = [
  {
    name: "sort-only",
    path: "docs/payments.md",
    text: (random) => `sort code ${plainSortCode(random)}`,
  },
  {
    name: "placeholder-mailbox",
    path: "docs/mail-export.md",
    text: (random) =>
      `${random.pick(mailboxNames)}@${random.pick(PLACEHOLDER_DOMAINS)}`,
  },
  {
    name: "non-checksum-iban",
    path: "docs/payments.md",
    text: (random) => nonChecksumIban(random),
  },
  {
    name: "example-hostname",
    path: "README.md",
    text: () => "example.pages.dev",
  },
];

const HARMLESS_RECORDS: readonly {
  readonly build: (sort: string, account: string) => string;
  readonly name: string;
  readonly path: string;
}[] = [
  {
    build: (sort, account) =>
      [`sort_code: ${sort}`, "", `account_number: ${account}`].join("\n"),
    name: "blank-line-split",
    path: "apps/cli/demo.yaml",
  },
  {
    build: (sort, account) =>
      [
        "first:",
        `  sort_code: ${sort}`,
        "second:",
        `  account_number: ${account}`,
      ].join("\n"),
    name: "separate-entries",
    path: "apps/cli/demo.yaml",
  },
];

describe("a container is read every way it can be read", () => {
  it(`reads ${EVERY_READING_CASES} seeded tables and diffs over every decoder`, () => {
    const random = makeRandom(EVERY_READING_SEED);

    const missed: string[] = [];

    for (let index = 0; index < EVERY_READING_CASES; index += 1) {
      const kind = random.pick(PREFIX_PAYLOADS);

      const wrap = random.pick(DECODER_WRAPS);

      const { document, label } = wrappedCase(
        random,
        kind.text(random),
        wrap.encode,
        LINE_ENDINGS
      );

      const rules = rulesOf(kind.path, document);

      if (!kind.rules.every((rule) => rules.includes(rule))) {
        missed.push(
          `${everyReadingLabel(EVERY_READING_SEED, index, [kind.name, wrap.name, ...label, JSON.stringify(rules)])}: ${document}`
        );
      }
    }

    expect(missed).toEqual([]);
  }, 600_000);

  it(`keeps ${EVERY_READING_HARMLESS} seeded harmless values quiet in every reading`, () => {
    const random = makeRandom(EVERY_READING_SEED + 1);

    const noisy: string[] = [];

    for (let index = 0; index < EVERY_READING_HARMLESS; index += 1) {
      if (index % 3 === 2) {
        const split = random.pick(HARMLESS_RECORDS);

        const ending = random.pick(LINE_ENDINGS);

        const text = split
          .build(plainSortCode(random), plainAccount(random))
          .split("\n")
          .join(ending);

        const rules = rulesOf(split.path, text);

        if (rules.length > 0) {
          noisy.push(
            `${everyReadingLabel(EVERY_READING_SEED + 1, index, [split.name, `ending ${JSON.stringify(ending)}`, JSON.stringify(rules)])}: ${text}`
          );
        }

        continue;
      }

      const document = random.pick(HARMLESS_VALUES);

      const wrap = random.pick(HARMLESS_WRAPS);

      const { document: built, label } = wrappedCase(
        random,
        document.text(random),
        wrap.encode,
        LINE_ENDINGS
      );

      const rules = rulesOf(document.path, built);

      if (rules.length > 0) {
        noisy.push(
          `${everyReadingLabel(EVERY_READING_SEED + 1, index, [document.name, wrap.name, ...label, JSON.stringify(rules)])}: ${built}`
        );
      }
    }

    expect(noisy).toEqual([]);
  }, 600_000);
});
