import { Schema } from "effect";

export const LineIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("LineId"));

export type LineId = typeof LineIdSchema.Type;

export const CategoryIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("CategoryId"));

export type CategoryId = typeof CategoryIdSchema.Type;

export const CategoryNameSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(120)
);

export type CategoryName = typeof CategoryNameSchema.Type;

export const CurrencyCodeSchema = Schema.String.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
).pipe(Schema.brand("CurrencyCode"));

export type CurrencyCode = typeof CurrencyCodeSchema.Type;

export const MinorUnitsSchema = Schema.Int.check(
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an integer a number holds exactly",
  })
).pipe(Schema.brand("MinorUnits"));

export type MinorUnits = typeof MinorUnitsSchema.Type;

export const ProviderNameSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("ProviderName"));

export type ProviderName = typeof ProviderNameSchema.Type;

export const ConfidenceSchema = Schema.Finite.check(
  Schema.isBetween({ maximum: 1, minimum: 0 })
).pipe(Schema.brand("Confidence"));

export type Confidence = typeof ConfidenceSchema.Type;

export const CategoryChoiceSchema = Schema.Struct({
  id: CategoryIdSchema,
  name: CategoryNameSchema,
});

export type CategoryChoice = typeof CategoryChoiceSchema.Type;

export const CategorizationSchema = Schema.TaggedUnion({
  PersonAssigned: { categoryId: CategoryIdSchema },
  Suggested: {
    categoryId: CategoryIdSchema,
    confidence: ConfidenceSchema,
    provider: ProviderNameSchema,
  },
  Unsorted: {},
});

export type Categorization = typeof CategorizationSchema.Type;

export const SortableLineSchema = Schema.Struct({
  amountMinor: MinorUnitsSchema,
  categorization: CategorizationSchema,
  currency: CurrencyCodeSchema,
  description: Schema.String.check(Schema.isMaxLength(500)),
  id: LineIdSchema,
});

export type SortableLine = typeof SortableLineSchema.Type;

export const DEFAULT_THRESHOLD = 0.8;

export const DEFAULT_TIMEOUT_MILLIS = 5000;

export const SortSettingsSchema = Schema.Struct({
  threshold: ConfidenceSchema,
  timeoutMillis: Schema.Int.check(Schema.isGreaterThan(0)),
});

export type SortSettings = typeof SortSettingsSchema.Type;

export const defaultSortSettings: SortSettings = {
  threshold: Schema.decodeSync(ConfidenceSchema)(DEFAULT_THRESHOLD),
  timeoutMillis: DEFAULT_TIMEOUT_MILLIS,
};
