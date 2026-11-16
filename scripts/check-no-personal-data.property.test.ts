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
