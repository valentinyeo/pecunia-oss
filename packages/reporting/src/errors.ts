// oxlint-disable eslint/max-classes-per-file -- the report contract lists these failures together, so one table keeps the union readable
import { Forbidden } from "@pecunia/access";
import { Schema } from "effect";

import type { CategoryId, CurrencyCode, PayeeId } from "./model.js";
import {
  CategoryIdSchema,
  CurrencyCodeSchema,
  PayeeIdSchema,
} from "./model.js";

export class RateMissing extends Schema.TaggedError<
  RateMissing,
  { readonly brand: unique symbol }
>()("RateMissing", {
  from: CurrencyCodeSchema,
  message: Schema.String,
  repair: Schema.String,
  to: CurrencyCodeSchema,
}) {}

export class AmountNotRepresentable extends Schema.TaggedError<
  AmountNotRepresentable,
  { readonly brand: unique symbol }
>()("AmountNotRepresentable", {
  message: Schema.String,
  repair: Schema.String,
}) {}

export class ReportSourceError extends Schema.TaggedError<
  ReportSourceError,
  { readonly brand: unique symbol }
>()("ReportSourceError", {
  message: Schema.String,
  repair: Schema.String,
}) {}

export class ReportOverflow extends Schema.TaggedError<
  ReportOverflow,
  { readonly brand: unique symbol }
>()("ReportOverflow", {
  message: Schema.String,
  repair: Schema.String,
  total: Schema.String,
}) {}

export class MixedCurrency extends Schema.TaggedError<
  MixedCurrency,
  { readonly brand: unique symbol }
>()("MixedCurrency", {
  currency: CurrencyCodeSchema,
  message: Schema.String,
  other: CurrencyCodeSchema,
  repair: Schema.String,
}) {}

export class CategoryCycle extends Schema.TaggedError<
  CategoryCycle,
  { readonly brand: unique symbol }
>()("CategoryCycle", {
  categoryId: CategoryIdSchema,
  message: Schema.String,
  repair: Schema.String,
}) {}

export class UnknownCategory extends Schema.TaggedError<
  UnknownCategory,
  { readonly brand: unique symbol }
>()("UnknownCategory", {
  categoryId: CategoryIdSchema,
  message: Schema.String,
  repair: Schema.String,
}) {}

export class UnknownClient extends Schema.TaggedError<
  UnknownClient,
  { readonly brand: unique symbol }
>()("UnknownClient", {
  clientId: PayeeIdSchema,
  message: Schema.String,
  repair: Schema.String,
}) {}

export const overflowOf = (total: string): ReportOverflow =>
  new ReportOverflow({
    message: `${total} leaves the range of an integer JavaScript holds exactly.`,
    repair:
      "Split the period into smaller ranges, or store the total as its own row before reporting it.",
    total,
  });

export const mixedCurrencyOf = (
  currency: CurrencyCode,
  other: CurrencyCode
): MixedCurrency =>
  new MixedCurrency({
    currency,
    message: `A transaction converts to ${other}, and this book keeps its base amounts in ${currency}.`,
    other,
    repair:
      "Re-import the row against the book's base currency, or change the base currency and re-import every row.",
  });

export const cycleOf = (categoryId: CategoryId): CategoryCycle =>
  new CategoryCycle({
    categoryId,
    message: `Category ${categoryId} is its own ancestor, so its spend has no root to roll up to.`,
    repair:
      "Clear one category's parent in the cycle, then read the category report again.",
  });

export const rateMissingOf = (
  from: CurrencyCode,
  to: CurrencyCode
): RateMissing =>
  new RateMissing({
    from,
    message: `No rate converts ${from} into ${to}, so the amount cannot join the book's totals.`,
    repair:
      "Add the exchange rate, or report only the accounts already in the book's base currency.",
    to,
  });

export const amountNotRepresentableOf = (
  message: string
): AmountNotRepresentable =>
  new AmountNotRepresentable({
    message,
    repair:
      "Convert a smaller amount, or store the amount in its own currency.",
  });

export const unknownCategoryOf = (categoryId: CategoryId): UnknownCategory =>
  new UnknownCategory({
    categoryId,
    message: `Category ${categoryId} is not a category of this profile.`,
    repair:
      "Pick a category id the category report returned, or clear the filter.",
  });

export const unknownClientOf = (clientId: PayeeId): UnknownClient =>
  new UnknownClient({
    clientId,
    message: `Client ${clientId} is not a payee in this profile.`,
    repair:
      "Pick a client id that `readIncome` returned, or clear the client filter.",
  });

export const ReportFailureSchema = Schema.Union([
  CategoryCycle,
  MixedCurrency,
  ReportOverflow,
  ReportSourceError,
  UnknownCategory,
  UnknownClient,
]);

export type ReportFailure = typeof ReportFailureSchema.Type;

export const ReportContractFailureSchema = Schema.Union([
  AmountNotRepresentable,
  CategoryCycle,
  Forbidden,
  MixedCurrency,
  RateMissing,
  ReportOverflow,
  ReportSourceError,
  UnknownCategory,
  UnknownClient,
]);

export type ReportContractFailure = typeof ReportContractFailureSchema.Type;
