import { Effect, Layer, Schema } from "effect";

import { CategoryChoiceSchema, ProviderNameSchema } from "./model.js";
import type { CategoryChoice, ProviderName, SortableLine } from "./model.js";
import { SortingProvider } from "./provider.js";
import type { SortingProviderPort } from "./provider.js";
import type { ProviderAnswer } from "./suggestion.js";

export const FakeSorterModeSchema = Schema.Literals([
  "valid",
  "unknown-category",
  "bad-confidence",
  "malformed",
  "throw",
  "hang",
]);

export type FakeSorterMode = typeof FakeSorterModeSchema.Type;

export interface FakeSorterOptions {
  readonly mode?: FakeSorterMode;
  readonly name?: ProviderName;
}

const defaultProviderName =
  Schema.decodeSync(ProviderNameSchema)("fake-sorter");

interface KeywordAnswer {
  readonly categoryId: string;
  readonly confidence: number;
  readonly keyword: string;
}

const keywordAnswers: readonly KeywordAnswer[] = [
  { categoryId: "category-cafe", confidence: 0.92, keyword: "example cafe" },
  { categoryId: "category-travel", confidence: 0.88, keyword: "demo rail" },
  {
    categoryId: "category-housing",
    confidence: 0.81,
    keyword: "sample landlord",
  },
];

export const demoCategories: readonly CategoryChoice[] = [
  Schema.decodeSync(CategoryChoiceSchema)({
    id: "category-cafe",
    name: "Cafe",
  }),
  Schema.decodeSync(CategoryChoiceSchema)({
    id: "category-travel",
    name: "Travel",
  }),
  Schema.decodeSync(CategoryChoiceSchema)({
    id: "category-housing",
    name: "Housing",
  }),
];

const keywordAnswerFor = (line: SortableLine): ProviderAnswer => {
  const description = line.description.toLowerCase();

  const match = keywordAnswers.find((answer) =>
    description.includes(answer.keyword)
  );

  return match === undefined
    ? { kind: "none" }
    : {
        categoryId: match.categoryId,
        confidence: match.confidence,
        kind: "suggested",
      };
};

const answerFor = (
  line: SortableLine,
  categories: readonly CategoryChoice[],
  mode: FakeSorterMode
): ProviderAnswer => {
  if (mode === "unknown-category") {
    return {
      categoryId: "category-not-offered",
      confidence: 0.99,
      kind: "suggested",
    };
  }

  if (mode === "bad-confidence") {
    return {
      categoryId: categories[0]?.id ?? "category-cafe",
      confidence: Number.NaN,
      kind: "suggested",
    };
  }

  if (mode === "malformed") {
    return { confidence: 0.9, kind: "suggested" };
  }

  return keywordAnswerFor(line);
};

export const makeFakeSorter = (
  options: FakeSorterOptions = {}
): SortingProviderPort => {
  const mode = options.mode ?? "valid";

  return {
    name: options.name ?? defaultProviderName,
    suggest: (line, categories) => {
      if (mode === "throw") {
        return Effect.die(new Error("FakeSorter throws on purpose"));
      }

      if (mode === "hang") {
        return Effect.never;
      }

      return Effect.succeed(answerFor(line, categories, mode));
    },
  };
};

export const fakeSorterLayer = (options: FakeSorterOptions = {}) =>
  Layer.succeed(SortingProvider, makeFakeSorter(options));
