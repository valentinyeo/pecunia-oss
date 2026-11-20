import {
  CategorizationSchema,
  CategoryChoiceSchema as SortCategoryChoice,
  CategoryIdSchema as SortCategoryId,
  LineIdSchema as SortLineId,
  MinorUnitsSchema as SortMinorUnits,
  parseProviderAnswer,
  ProviderNameSchema,
  SortableLineSchema,
  SortingProvider,
  sortLines,
} from "@pecunia/ai-sorting";
import type {
  CategoryChoice as SortChoice,
  ProviderAnswer,
  SortResult,
  SortableLine,
  SortingProviderPort,
} from "@pecunia/ai-sorting";
import type { BankLine } from "@pecunia/bank-lines/model";
import { Effect, Layer, Option, Predicate, Schema } from "effect";

import type { CategoryChoiceValue } from "../catalogue.js";
import { SuggestedLine } from "./model.js";
import type { SuggestedLineValue } from "./model.js";

const decode = Schema.decodeSync;

const descriptionOf = (line: BankLine): string =>
  line.raw.merchant === "" ? line.raw.description : line.raw.merchant;

export const sortChoiceOf = (choice: CategoryChoiceValue): SortChoice =>
  decode(SortCategoryChoice)({
    id: decode(SortCategoryId)(choice.id),
    name: choice.name,
  });

export const sortableLineOf = (line: BankLine): SortableLine =>
  decode(SortableLineSchema)({
    amountMinor: decode(SortMinorUnits)(line.amount.minor),
    categorization: Option.match(line.category, {
      onNone: () => CategorizationSchema.cases.Unsorted.make({}),
      onSome: (categoryId) =>
        CategorizationSchema.cases.PersonAssigned.make({
          categoryId: decode(SortCategoryId)(categoryId),
        }),
    }),
    currency: line.amount.currency,
    description: descriptionOf(line),
    id: decode(SortLineId)(line.id),
  });

export const suggestedOf = (
  result: SortResult
): readonly SuggestedLineValue[] =>
  result.lines.flatMap((line) =>
    Predicate.isTagged(line.categorization, "Suggested")
      ? [
          decode(SuggestedLine)({
            categoryId: line.categorization.categoryId,
            confidence: line.categorization.confidence,
            lineId: line.id,
          }),
        ]
      : []
  );

interface KeywordAnswer {
  readonly categoryId: string;
  readonly confidence: number;
  readonly keyword: string;
}

const keywordAnswers: readonly KeywordAnswer[] = [
  {
    categoryId: "0192f0c1-000d-75e9-8fd7-fd7e43c901ee",
    confidence: 0.86,
    keyword: "demo tax office",
  },
  {
    categoryId: "0192f0c1-000f-755b-8ae4-ae47d20b52cf",
    confidence: 0.83,
    keyword: "demo design tool",
  },
  {
    categoryId: "0192f0c1-0011-79f9-8c9a-c9af5a7eff0d",
    confidence: 0.91,
    keyword: "demo coffee",
  },
];

const answerFor = (line: SortableLine): ProviderAnswer =>
  Option.match(
    Option.fromUndefinedOr(
      keywordAnswers.find((answer) =>
        line.description.toLowerCase().includes(answer.keyword)
      )
    ),
    {
      onNone: () => ({ kind: "none" }),
      onSome: (answer) => ({
        categoryId: answer.categoryId,
        confidence: answer.confidence,
        kind: "suggested",
      }),
    }
  );

const demoProviderName = decode(ProviderNameSchema)("demo-sorter");

export const demoSorter: SortingProviderPort = {
  name: demoProviderName,
  suggest: (line, categories) =>
    Effect.succeed(parseProviderAnswer(answerFor(line), categories)),
};

export const demoSorterLayer = Layer.succeed(SortingProvider, demoSorter);

export const suggestCategories = (
  lines: readonly SortableLine[],
  categories: readonly SortChoice[]
) => sortLines({ categories, lines }).pipe(Effect.provide(demoSorterLayer));
