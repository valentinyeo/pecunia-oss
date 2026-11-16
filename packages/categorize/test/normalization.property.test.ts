import { expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  CategoryIdSchema,
  DisplayNameSchema,
  MinorUnitsSchema,
  ProfileIdSchema,
  RuleIdSchema,
  RuleSchema,
  normalizeName,
  ruleMatches,
} from "../src/index.js";
import type { MatchableLine, MatchType, Rule } from "../src/index.js";

const CASES = 500;

const makeRandom = (seed: number) => {
  let state = (seed % 2_147_483_646) + 1;

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state / 2_147_483_647;
  };
};

type Random = ReturnType<typeof makeRandom>;

const between = (random: Random, maximum: number) =>
  Math.floor(random() * maximum);

const pick = <Value>(random: Random, values: readonly Value[]): Value => {
  const value = values[between(random, values.length)];

  if (value === undefined) {
    throw new Error("The generator picked from an empty list.");
  }

  return value;
};

const ruleId = Schema.decodeSync(RuleIdSchema)(
  "0192f0c1-0015-727a-8b92-b929ac9448a7"
);

const categoryId = Schema.decodeSync(CategoryIdSchema)(
  "0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba"
);

const profileId = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

const nameWords = [
  "Demo",
  "Cloud",
  "Hosting",
  "Müller",
  "Ltd",
  "EUR",
  "2025",
  "rail",
  "coffee",
] as const;

const separatorSpellings = [
  " ",
  "  ",
  "\t",
  " - ",
  ".",
  "/",
  "_",
  "&",
  "\n",
] as const;

const blankSpellings = ["   ", "-", "&&", "\t", "///", " - - ", ""] as const;

const whiteSpaceRuns = [" ", "  ", "\t", " \t ", "\n", "   "] as const;

const digitSeparators = ["", "-", " ", "/", ".", "  ", "_"] as const;

const textMatchTypes: readonly MatchType[] = ["contains", "exact", "prefix"];

const line = (merchant: string, reference: string): MatchableLine => ({
  description: "",
  direction: "out",
  merchant,
  minorAmount: Schema.decodeSync(MinorUnitsSchema)(4800),
  reference,
});

const textRule = (matchType: MatchType, pattern: string): Rule =>
  Schema.decodeSync(RuleSchema)({
    categoryId,
    direction: "any",
    enabled: true,
    id: ruleId,
    kind: "categorize",
    matchField: "merchant",
    matchType,
    maxAmount: null,
    minAmount: null,
    pattern,
    priority: 10,
    profileId,
  });

const referenceRule = (pattern: string): Rule =>
  Schema.decodeSync(RuleSchema)({
    categoryId,
    direction: "any",
    enabled: true,
    id: ruleId,
    kind: "categorize",
    matchField: "reference",
    matchType: "digits_only",
    maxAmount: null,
    minAmount: null,
    pattern,
    priority: 10,
    profileId,
  });

const slugPattern = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

it("normalizes every spelling of a name to one slug", () => {
  const random = makeRandom(2_393_001);

  for (let index = 0; index < CASES; index += 1) {
    const words = Array.from({ length: 1 + between(random, 3) }, () =>
      pick(random, nameWords)
    );

    const slug = normalizeName(words.join(" "));

    const spellings = [
      words.join("  "),
      words.join("\t"),
      words.join(" - "),
      words.join("/"),
      words.join("."),
      words.map((word) => word.toUpperCase()).join("  "),
      ` ${words.join("_")} `,
      words.join("\n"),
    ];

    for (const spelling of spellings) {
      expect(normalizeName(spelling)).toBe(slug);
    }

    expect(normalizeName(slug)).toBe(slug);
    expect(normalizeName(slug.toUpperCase())).toBe(slug);
    expect(slug).toMatch(slugPattern);
    expect(() => Schema.decodeSync(DisplayNameSchema)(slug)).not.toThrow();
  }
});

it("normalizes a name made only of separators to the blank the row schema refuses", () => {
  const random = makeRandom(2_393_002);

  for (let index = 0; index < CASES; index += 1) {
    const spelling =
      pick(random, blankSpellings) +
      Array.from({ length: between(random, 4) }, () =>
        pick(random, separatorSpellings)
      ).join("");

    expect(normalizeName(spelling)).toBe("");
  }

  expect(() => Schema.decodeSync(DisplayNameSchema)("")).toThrow();
});

it("matches the same rule whatever case and whitespace a bank sends", () => {
  const random = makeRandom(2_393_003);

  for (let index = 0; index < CASES; index += 1) {
    const words = Array.from({ length: 2 + between(random, 3) }, () =>
      pick(random, nameWords)
    );

    const tidy = words.join(" ");

    const messy =
      pick(random, whiteSpaceRuns) +
      words
        .map((word) =>
          random() < 0.5 ? word.toUpperCase() : word.toLowerCase()
        )
        .join(pick(random, whiteSpaceRuns)) +
      pick(random, whiteSpaceRuns);

    const patterns = [
      tidy,
      pick(random, words),
      words.slice(0, 2).join(" "),
      tidy.toUpperCase(),
      words.at(-1) ?? tidy,
    ];

    for (const matchType of textMatchTypes) {
      for (const pattern of patterns) {
        const rule = textRule(matchType, pattern);

        expect(ruleMatches(rule, line(messy, ""))).toBe(
          ruleMatches(rule, line(tidy, ""))
        );
      }
    }
  }
});

it("matches a digits pattern however the reference separates the digits", () => {
  const random = makeRandom(2_393_004);

  for (let index = 0; index < CASES; index += 1) {
    const digits = Array.from({ length: 3 + between(random, 6) }, () =>
      String(between(random, 10))
    ).join("");

    const decorated = digits.split("").join(pick(random, digitSeparators));
    const rule = referenceRule(digits);

    expect(ruleMatches(rule, line("Demo", digits))).toBe(true);
    expect(
      ruleMatches(
        rule,
        line("Demo", `${decorated}${pick(random, ["", " ", " ref"])}`)
      )
    ).toBe(true);
    expect(
      ruleMatches(rule, line("Demo", pick(random, ["", "DEMO", "ref", "none"])))
    ).toBe(false);
  }
});
