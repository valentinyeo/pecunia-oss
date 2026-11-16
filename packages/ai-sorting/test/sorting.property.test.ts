import { describe, expect, it } from "@effect/vitest";
import { Effect, Predicate, Schema } from "effect";

import {
  CategorizationSchema,
  CategoryChoiceSchema,
  ConfidenceSchema,
  ProviderNameSchema,
  SortableLineSchema,
  SortingProvider,
  sortLines,
} from "../src/index.js";
import type {
  Categorization,
  CategoryChoice,
  Confidence,
  LineId,
  ProviderAnswer,
  SortableLine,
  SortingProviderPort,
} from "../src/index.js";

const CASE_COUNT = 600;

const SEED = 20_261_116;

const PROVIDER = Schema.decodeSync(ProviderNameSchema)("property-sorter");

const CURRENCIES = ["GBP", "EUR", "USD", "JPY"] as const;

const DESCRIPTIONS = [
  "Example Cafe",
  "Demo Rail",
  "Sample Landlord",
  "Example Market",
  "Unseen Merchant",
] as const;

type Random = () => number;

const makeRandom = (seed: number): Random => {
  let state = seed % 4_294_967_296;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const pick = <A>(random: Random, values: readonly A[]): A => {
  const value = values[Math.floor(random() * values.length)];

  if (value === undefined) {
    throw new Error("The generator picked from an empty list");
  }

  return value;
};

const randomInt = (random: Random, minimum: number, maximum: number) =>
  minimum + Math.floor(random() * (maximum - minimum + 1));

const randomConfidence = (random: Random): Confidence =>
  Schema.decodeSync(ConfidenceSchema)(Math.round(random() * 100) / 100);

const makeCategories = (random: Random): readonly CategoryChoice[] => {
  const count = randomInt(random, 1, 5);

  return Array.from({ length: count }, (_, index) =>
    Schema.decodeSync(CategoryChoiceSchema)({
      id: `category-${index}`,
      name: `Category ${index}`,
    })
  );
};

const makeCategorization = (
  random: Random,
  categories: readonly CategoryChoice[]
): Categorization => {
  const kind = pick(random, ["unsorted", "person", "suggested"] as const);

  if (kind === "person") {
    return CategorizationSchema.cases.PersonAssigned.make({
      categoryId: pick(random, categories).id,
    });
  }

  if (kind === "suggested") {
    return CategorizationSchema.cases.Suggested.make({
      categoryId: pick(random, categories).id,
      confidence: randomConfidence(random),
      provider: PROVIDER,
    });
  }

  return CategorizationSchema.cases.Unsorted.make({});
};

const makeLines = (
  random: Random,
  categories: readonly CategoryChoice[],
  caseIndex: number
): readonly SortableLine[] => {
  const count = randomInt(random, 1, 6);

  return Array.from({ length: count }, (_, index) =>
    Schema.decodeSync(SortableLineSchema)({
      amountMinor: randomInt(random, -1_000_000, 1_000_000),
      categorization: makeCategorization(random, categories),
      currency: pick(random, CURRENCIES),
      description: pick(random, DESCRIPTIONS),
      id: `line-${caseIndex}-${index}`,
    })
  );
};

const ANSWER_PLANS = [
  "known",
  "unknown",
  "high",
  "low",
  "nan",
  "throw",
  "none",
  "malformed",
] as const;

type AnswerPlan = (typeof ANSWER_PLANS)[number];

interface PlannedAnswer {
  readonly answer: ProviderAnswer;
  readonly throws: boolean;
}

const makeAnswer = (
  random: Random,
  categories: readonly CategoryChoice[]
): PlannedAnswer => {
  const plan: AnswerPlan = pick(random, ANSWER_PLANS);
  const categoryId = pick(random, categories).id;

  if (plan === "throw") {
    return { answer: { kind: "none" }, throws: true };
  }

  if (plan === "unknown") {
    return {
      answer: {
        categoryId: "category-not-offered",
        confidence: randomConfidence(random),
        kind: "suggested",
      },
      throws: false,
    };
  }

  if (plan === "high") {
    return {
      answer: { categoryId, confidence: 1.5, kind: "suggested" },
      throws: false,
    };
  }

  if (plan === "low") {
    return {
      answer: { categoryId, confidence: -0.25, kind: "suggested" },
      throws: false,
    };
  }

  if (plan === "nan") {
    return {
      answer: { categoryId, confidence: Number.NaN, kind: "suggested" },
      throws: false,
    };
  }

  if (plan === "none") {
    return { answer: { kind: "none" }, throws: false };
  }

  if (plan === "malformed") {
    return { answer: { confidence: 0.9, kind: "suggested" }, throws: false };
  }

  return {
    answer: {
      categoryId,
      confidence: randomConfidence(random),
      kind: "suggested",
    },
    throws: false,
  };
};

const makeProvider = (
  answers: ReadonlyMap<LineId, PlannedAnswer>
): SortingProviderPort => ({
  name: PROVIDER,
  suggest: (line) => {
    const planned = answers.get(line.id);

    if (planned === undefined || planned.throws) {
      return Effect.die(new Error("The planned provider failure"));
    }

    return Effect.succeed(planned.answer);
  },
});

const makeThreshold = (random: Random): Confidence =>
  Schema.decodeSync(ConfidenceSchema)(Math.round(random() * 100) / 100);

describe("sortLines property", () => {
  it.effect(
    "stores only a listed suggestion at or above the threshold, or nothing",
    () =>
      Effect.gen(function* sortingProperty() {
        for (let caseIndex = 0; caseIndex < CASE_COUNT; caseIndex += 1) {
          const random = makeRandom(SEED + caseIndex);
          const categories = makeCategories(random);
          const lines = makeLines(random, categories, caseIndex);

          const answers = new Map<LineId, PlannedAnswer>(
            lines.map((line): [LineId, PlannedAnswer] => [
              line.id,
              makeAnswer(random, categories),
            ])
          );

          const threshold = makeThreshold(random);
          const settings = { threshold, timeoutMillis: 1000 };
          const provider = makeProvider(answers);
          const request = { categories, lines, settings };

          const first = yield* sortLines(request).pipe(
            Effect.provideService(SortingProvider, provider)
          );

          const second = yield* sortLines({
            ...request,
            lines: first.lines,
          }).pipe(Effect.provideService(SortingProvider, provider));

          const originalById = new Map(lines.map((line) => [line.id, line]));

          const expectedFailureIds = lines
            .filter(
              (line) =>
                Predicate.isTagged(line.categorization, "Unsorted") &&
                answers.get(line.id)?.throws === true
            )
            .map((line) => line.id);

          expect(
            first.failures.map((failure) => failure.lineId).toSorted(),
            `case ${caseIndex}: failures`
          ).toStrictEqual(expectedFailureIds.toSorted());

          expect(
            first.failures.every((failure) => failure.provider === PROVIDER),
            `case ${caseIndex}: provider names`
          ).toBe(true);

          for (const line of first.lines) {
            const original = originalById.get(line.id);

            expect(
              original,
              `case ${caseIndex}: line ${line.id}`
            ).toBeDefined();

            if (original === undefined) {
              continue;
            }

            const { categorization } = line;
            const before = original.categorization;

            if (Predicate.isTagged(before, "PersonAssigned")) {
              expect(
                categorization,
                `case ${caseIndex}: a person-assigned line changed`
              ).toStrictEqual(before);
            } else if (Predicate.isTagged(before, "Suggested")) {
              expect(
                categorization,
                `case ${caseIndex}: an earlier suggestion changed`
              ).toStrictEqual(before);
            } else {
              expect(
                Predicate.isTagged(categorization, "PersonAssigned"),
                `case ${caseIndex}: the sorter assigned a person category`
              ).toBe(false);

              if (Predicate.isTagged(categorization, "Suggested")) {
                const suggestedCategory = categorization.categoryId;

                expect(
                  categories.some((entry) => entry.id === suggestedCategory),
                  `case ${caseIndex}: a category outside the list was stored`
                ).toBe(true);

                expect(
                  categorization.confidence,
                  `case ${caseIndex}: a confidence below the threshold was stored`
                ).toBeGreaterThanOrEqual(threshold);
              } else {
                expect(
                  Predicate.isTagged(categorization, "Unsorted"),
                  `case ${caseIndex}: an unexpected categorization was stored`
                ).toBe(true);
              }
            }
          }

          expect(
            second.lines,
            `case ${caseIndex}: second run lines`
          ).toStrictEqual(first.lines);
          expect(
            second.failures,
            `case ${caseIndex}: second run failures`
          ).toStrictEqual(first.failures);
        }
      })
  );
});
