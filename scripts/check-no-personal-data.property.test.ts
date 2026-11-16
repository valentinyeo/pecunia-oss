import { describe, expect, it } from "vitest";

import { findPersonalData } from "./check-no-personal-data.ts";
import type { AllowList } from "./check-no-personal-data.ts";

const empty: AllowList = { skipped: [], values: [] };

const CASES = 500;

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
  "-",
  "\u2011",
  "  ",
  "-\t",
  " \u00A0",
  "--",
  " - ",
];

const separated = (values: readonly string[], random: Random) => {
  let text = values[0] ?? "";

  for (const value of values.slice(1)) {
    text += `${random.pick(SEPARATORS)}${value}`;
  }

  return text;
};

const groups = (iban: string) => {
  const parts: string[] = [];

  for (let index = 0; index < iban.length; index += 4) {
    parts.push(iban.slice(index, index + 4));
  }

  return parts;
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

  return `${country}${random.digits(2)}${random.alphanumeric(length - 4)}`;
};

const renderIban = (iban: string, random: Random) => {
  const [head = "", ...rest] = groups(iban);

  const parts =
    random.between(1, 4) === 1
      ? [head.slice(0, 2), head.slice(2), ...rest]
      : [head, ...rest];

  return separated(parts, random);
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
  " ",
  "-",
  "\t",
  "\u00A0",
  "\u2007",
  "  ",
  " - ",
  "-\t",
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
  keep: "both" | "sort" | "account"
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

  const head = keep === "account" ? [] : [sortField];

  const tail = keep === "sort" ? [] : [accountField];

  return [...head, ...between, ...tail];
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

const FORMATS = ["json", "compact", "yaml", "csv", "prose"] as const;

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

  return format === "prose" ? proseText(fields) : jsonText(fields);
};

describe("a sort code and an account number inside one record are reported as a pair", () => {
  it(`pairs ${CASES} seeded records and keeps either one alone quiet`, () => {
    const random = makeRandom(SEED + 1);

    const missed: string[] = [];

    const alone: string[] = [];

    for (let index = 0; index < CASES; index += 1) {
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

      const paired = bankDocument(
        format,
        bankFields(sortCode, accountNumber, between, "both")
      );

      if (!rulesOf("docs/payments.md", paired).includes("bank-account")) {
        missed.push(paired);
      }

      for (const keep of ["sort", "account"] as const) {
        const single = bankDocument(
          format,
          bankFields(sortCode, accountNumber, between, keep)
        );

        if (rulesOf("docs/payments.md", single).length > 0) {
          alone.push(single);
        }
      }
    }

    expect({ alone, missed }).toEqual({ alone: [], missed: [] });
  });
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
