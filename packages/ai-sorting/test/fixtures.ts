import { Schema } from "effect";

import {
  CategorizationSchema,
  CategoryChoiceSchema,
  CategoryIdSchema,
  ConfidenceSchema,
  ProviderNameSchema,
  SortableLineSchema,
  SuggestionSchema,
} from "../src/index.js";
import type {
  Categorization,
  CategoryChoice,
  Confidence,
  ProviderName,
  SortableLine,
  Suggestion,
} from "../src/index.js";

export const categoryId = (value: string) =>
  Schema.decodeSync(CategoryIdSchema)(value);

export const confidence = (value: number): Confidence =>
  Schema.decodeSync(ConfidenceSchema)(value);

export const providerName = (value: string): ProviderName =>
  Schema.decodeSync(ProviderNameSchema)(value);

export const category = (id: string, name: string): CategoryChoice =>
  Schema.decodeSync(CategoryChoiceSchema)({ id, name });

export const unsorted = (): Categorization =>
  CategorizationSchema.cases.Unsorted.make({});

export const personAssigned = (id: string): Categorization =>
  CategorizationSchema.cases.PersonAssigned.make({
    categoryId: categoryId(id),
  });

export const suggested = (
  id: string,
  value: number,
  provider: string
): Categorization =>
  CategorizationSchema.cases.Suggested.make({
    categoryId: categoryId(id),
    confidence: confidence(value),
    provider: providerName(provider),
  });

export const suggestion = (id: string, value: number): Suggestion =>
  SuggestionSchema.cases.Suggested.make({
    categoryId: categoryId(id),
    confidence: confidence(value),
  });

export interface LineInput {
  readonly amountMinor?: number;
  readonly categorization: Categorization;
  readonly currency?: string;
  readonly description: string;
  readonly id: string;
}

export const makeLine = (input: LineInput): SortableLine =>
  Schema.decodeSync(SortableLineSchema)({
    amountMinor: input.amountMinor ?? -1250,
    categorization: input.categorization,
    currency: input.currency ?? "GBP",
    description: input.description,
    id: input.id,
  });
