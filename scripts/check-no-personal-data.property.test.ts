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
import { findPersonalData } from "./check-no-personal-data.ts";
import type { AllowList } from "./check-no-personal-data.ts";

const empty: AllowList = { skipped: [], values: [] };

const CASES = 500;

const PAIR_CASES = 600;

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
  "\t",
  "\u00A0",
  "\u2007",
  "\u202F",
  "\u3000",
  "\uFEFF",
  "-",
  "\u2010",
  "\u2011",
  "\u2013",
  "\u2014",
  ".",
  "  ",
  " \u00A0",
  "--",
  " - ",
  "  \u00A0",
];

const separated = (values: readonly string[], random: Random) => {
  let text = values[0] ?? "";

  for (const value of values.slice(1)) {
    text += `${random.pick(SEPARATORS)}${value}`;
  }

  return text;
};

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

const makeIban = (random: Random) => {
  const [country, length] = random.pick(IBAN_COUNTRIES);

  return `${country}${random.digits(2)}${random.alphanumeric(4)}${random.digits(length - 8)}`;
};

const renderIban = (iban: string, random: Random) => {
  if (random.between(1, 4) === 1) {
    return iban;
  }

  const parts = [iban.slice(0, 2)];

  for (let index = 2; index < iban.length;) {
    const size = random.between(1, 4);

    parts.push(iban.slice(index, index + size));

    index += size;
  }

  const text = separated(parts, random);

  return random.between(1, 3) === 1 ? text.toLowerCase() : text;
};

const surroundings = (rendered: string, random: Random) =>
  random.pick([
    `${random.prose(4)} ${rendered} ${random.prose(3)}`,
    `const iban = "${rendered}";`,
    `| ${rendered} | ${random.prose(2)} |`,
    `${random.prose(3)}\n${rendered}\n${random.prose(3)}`,
    `Pay ${random.prose(2)}, reference ${rendered}, on file.`,
  ]);

describe("every valid-length IBAN is reported however its groups are separated", () => {
  it(`reports ${CASES} seeded renderings`, () => {
    const random = makeRandom(SEED);

    const missed: string[] = [];

    for (let index = 0; index < CASES; index += 1) {
      const text = surroundings(renderIban(makeIban(random), random), random);

      if (!rulesOf("docs/payments.md", text).includes("iban")) {
        missed.push(text);
      }
    }

    expect(missed).toEqual([]);
  });
});

const BANK_SEPARATORS = [
  "",
  "",
  " ",
  "\u00A0",
  "\u2007",
  "\u202F",
  "-",
  "\u2011",
  "\u2013",
  ".",
  "  ",
  " \u00A0",
  "--",
  " - ",
];

const makeSortCode = (random: Random) => {
  const pairs = [random.digits(2), random.digits(2), random.digits(2)];

  return random.between(1, 4) === 1
    ? pairs.join("")
    : `${pairs[0]}${random.pick(BANK_SEPARATORS)}${pairs[1]}${random.pick(BANK_SEPARATORS)}${pairs[2]}`;
};

const makeAccountNumber = (random: Random) =>
  random.between(1, 4) === 1
    ? random.digits(8)
    : `${random.digits(4)}${random.pick(BANK_SEPARATORS)}${random.digits(4)}`;

interface Field {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

const bankFields = (
  sortCode: string,
  accountNumber: string,
  between: readonly Field[],
  keep: "both" | "sort" | "account",
  accountFirst: boolean
) => {
  const sortField: Field = {
    key: "sortCode",
    label: "sort code",
    value: sortCode,
  };

  const accountField: Field = {
    key: "accountNumber",
    label: "account number",
    value: accountNumber,
  };

  const first = accountFirst ? accountField : sortField;

  const second = accountFirst ? sortField : accountField;

  const kept =
    keep === "both"
      ? [first, second]
      : [first, second].filter((field) =>
          keep === "sort"
            ? field.key === "sortCode"
            : field.key === "accountNumber"
        );

  const [head, ...tail] = kept;

  return head === undefined ? [...between] : [head, ...between, ...tail];
};

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

const proseText = (fields: readonly Field[]) =>
  fields.map((field) => `The ${field.label} is ${field.value}.`).join(" ");

const tsvText = (fields: readonly Field[]) =>
  [
    fields.map((field) => field.key).join("\t"),
    fields.map((field) => field.value).join("\t"),
  ].join("\n");

const semicolonText = (fields: readonly Field[]) =>
  fields.map((field) => field.value).join("; ");

const pipeText = (fields: readonly Field[]) =>
  fields.map((field) => field.value).join(" | ");

const linesText = (fields: readonly Field[]) =>
  fields.map((field) => field.value).join("\n");

const indentedText = (fields: readonly Field[]) =>
  fields.map((field) => `  ${field.value}`).join("\n");

const FORMATS = [
  "json",
  "compact",
  "yaml",
  "csv",
  "prose",
  "tsv",
  "semicolon",
  "pipe",
  "lines",
  "indented",
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

  if (format === "prose") {
    return proseText(fields);
  }

  if (format === "tsv") {
    return tsvText(fields);
  }

  if (format === "semicolon") {
    return semicolonText(fields);
  }

  if (format === "pipe") {
    return pipeText(fields);
  }

  if (format === "lines") {
    return linesText(fields);
  }

  if (format === "indented") {
    return indentedText(fields);
  }

  return jsonText(fields);
};

describe("a sort code and an account number inside one record are reported as a pair", () => {
  it(`pairs ${PAIR_CASES} seeded records and keeps either one alone quiet`, () => {
    const random = makeRandom(SEED + 1);

    const missed: string[] = [];

    const alone: string[] = [];

    for (let index = 0; index < PAIR_CASES; index += 1) {
      const sortCode = makeSortCode(random);

      const accountNumber = makeAccountNumber(random);

      const between = Array.from(
        { length: random.between(0, 12) },
        (_, position) => {
          const key = `${random.pick(WORDS)}${position}`;

          return { key, label: key, value: random.pick(WORDS) };
        }
      );

      const format = random.pick(FORMATS);

      const accountFirst = random.between(1, 2) === 1;

      const paired = bankDocument(
        format,
        bankFields(sortCode, accountNumber, between, "both", accountFirst)
      );

      if (!rulesOf("docs/payments.md", paired).includes("bank-account")) {
        missed.push(paired);
      }

      for (const keep of ["sort", "account"] as const) {
        const single = bankDocument(
          format,
          bankFields(sortCode, accountNumber, between, keep, accountFirst)
        );

        if (rulesOf("docs/payments.md", single).length > 0) {
          alone.push(single);
        }
      }
    }

    expect({ alone, missed }).toEqual({ alone: [], missed: [] });
  }, 30_000);
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
  it(`keeps ${PAIR_CASES} seeded records of each kind quiet`, () => {
    const paired: string[] = [];

    for (const [kind, [label, make]] of COUNTER_VALUES.entries()) {
      const random = makeRandom(SEED + 11 + kind);

      for (let index = 0; index < PAIR_CASES; index += 1) {
        const text = counterText(make(random), random.digits(8), random);

        if (rulesOf("docs/payments.md", text).includes("bank-account")) {
          paired.push(`${label}: ${text}`);
        }
      }
    }

    expect(paired).toEqual([]);
  }, 30_000);
});

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

const EMAIL_LEADS = [
  "",
  " ",
  "'",
  '"',
  "\\",
  "(",
  ")",
  "[",
  "]",
  ",",
  ":",
  "\n",
];

const EMAIL_TAILS = ["", " ", "\n", ")", "'", "."];

describe("every email address is reported after any punctuation, and the placeholders are not", () => {
  it(`reports ${CASES} seeded addresses and excuses ${CASES} placeholders`, () => {
    const random = makeRandom(SEED + 2);

    const missed: string[] = [];

    const placeholders: string[] = [];

    for (let index = 0; index < CASES; index += 1) {
      const local = random.pick(EMAIL_LOCALS);

      const lead = random.pick(EMAIL_LEADS);

      const tail = random.pick(EMAIL_TAILS);

      const address = `${local}@${random.pick(EMAIL_DOMAINS)}`;

      const text = `${random.prose(3)}${lead}${address}${tail} ${random.prose(2)}`;

      if (!rulesOf("apps/site/test/fixture.ts", text).includes("email")) {
        missed.push(text);
      }

      const placeholder = `${local}@${random.pick(PLACEHOLDER_DOMAINS)}`;

      const placeholderText = `${random.prose(3)}${lead}${placeholder}${tail} ${random.prose(2)}`;

      if (rulesOf("apps/site/test/fixture.ts", placeholderText).length > 0) {
        placeholders.push(placeholderText);
      }
    }

    expect({ missed, placeholders }).toEqual({ missed: [], placeholders: [] });
  });
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
