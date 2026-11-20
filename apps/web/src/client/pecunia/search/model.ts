import { BankLineSchema, CategoryIdSchema } from "@pecunia/bank-lines/model";
import type { BankLinePage } from "@pecunia/bank-lines/model";
import { Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import { Query } from "../bank-lines/model.js";
import { CategoryChoice } from "../catalogue.js";
import type { CategoryChoiceValue } from "../catalogue.js";
import { Holding, HoldingIdSchema } from "./demo.js";
import type { HoldingValue } from "./demo.js";

export const SUGGESTION_LIMIT = 5;

export const Suggestion = defineTaggedUnion({
  Category: { categoryId: CategoryIdSchema, label: Schema.NonEmptyString },
  Holding: { holdingId: HoldingIdSchema, label: Schema.NonEmptyString },
  Merchant: { label: Schema.NonEmptyString },
});

export type SuggestionValue = typeof Suggestion.Type;

export const Findings = defineTaggedUnion({
  Empty: { query: Query },
  Failed: { query: Query, reason: Schema.NonEmptyString },
  Idle: {},
  Ready: {
    categories: Schema.Array(CategoryChoice),
    holdings: Schema.Array(Holding),
    payments: Schema.Array(BankLineSchema),
    query: Query,
  },
  Searching: { query: Query },
});

export type FindingsValue = typeof Findings.Type;

export const SearchModel = Schema.Struct({
  findings: Findings,
  query: Query,
  suggestions: Schema.Array(Suggestion),
});

export type SearchModelValue = typeof SearchModel.Type;

export const initialSearch: SearchModelValue = {
  findings: Findings.Idle(),
  query: "",
  suggestions: [],
};

export interface SearchWorld {
  readonly catalogue: readonly CategoryChoiceValue[];
  readonly holdings: readonly HoldingValue[];
  readonly merchants: readonly string[];
}

const contains = (label: string, needle: string): boolean =>
  label.toLowerCase().includes(needle);

const starts = (label: string, needle: string): boolean =>
  label.toLowerCase().startsWith(needle);

const merchantSuggestions = (
  needle: string,
  merchants: readonly string[]
): readonly SuggestionValue[] =>
  merchants.flatMap((merchant) =>
    contains(merchant, needle) ? [Suggestion.Merchant({ label: merchant })] : []
  );

export const suggestionsFor = (
  query: string,
  world: SearchWorld
): readonly SuggestionValue[] => {
  const needle = query.trim().toLowerCase();

  if (needle === "") {
    return [];
  }

  const offered = [
    ...world.catalogue.flatMap((choice) =>
      contains(choice.name, needle)
        ? [Suggestion.Category({ categoryId: choice.id, label: choice.name })]
        : []
    ),
    ...world.holdings.flatMap((holding) =>
      contains(holding.name, needle)
        ? [Suggestion.Holding({ holdingId: holding.id, label: holding.name })]
        : []
    ),
    ...merchantSuggestions(needle, world.merchants),
  ];

  return offered
    .toSorted(
      (left, right) =>
        Number(starts(right.label, needle)) - Number(starts(left.label, needle))
    )
    .slice(0, SUGGESTION_LIMIT);
};

export const findingsOf = (
  query: string,
  page: BankLinePage,
  world: SearchWorld
): FindingsValue => {
  const needle = query.trim().toLowerCase();

  if (needle === "") {
    return Findings.Empty({ query });
  }

  const categories = world.catalogue.filter((choice) =>
    contains(choice.name, needle)
  );

  const holdings = world.holdings.filter((holding) =>
    contains(holding.name, needle)
  );

  const { lines } = page;

  return categories.length + holdings.length + lines.length === 0
    ? Findings.Empty({ query })
    : Findings.Ready({
        categories: [...categories],
        holdings: [...holdings],
        payments: [...lines],
        query,
      });
};
