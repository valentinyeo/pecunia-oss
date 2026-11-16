import { DateTime, Option, Schema, SchemaTransformation } from "effect";

export const ProviderIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("ProviderId")
);

export type ProviderId = typeof ProviderIdSchema.Type;

export const AccountIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("AccountId")
);

export type AccountId = typeof AccountIdSchema.Type;

export const ProviderLineIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("ProviderLineId")
);

export type ProviderLineId = typeof ProviderLineIdSchema.Type;

export const CursorSchema = Schema.NonEmptyString.pipe(Schema.brand("Cursor"));

export type Cursor = typeof CursorSchema.Type;

export const CurrencyCodeSchema = Schema.String.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
).pipe(Schema.brand("CurrencyCode"));

export type CurrencyCode = typeof CurrencyCodeSchema.Type;

export const MinorUnitsSchema = Schema.Int.pipe(Schema.brand("MinorUnits"));

export type MinorUnits = typeof MinorUnitsSchema.Type;

const isCalendarDate = Schema.makeFilter<string>(
  (value) =>
    Option.exists(
      DateTime.make(`${value}T00:00:00Z`),
      (date) => DateTime.formatIsoDateUtc(date) === value
    ),
  { expected: "a real calendar date in YYYY-MM-DD form" }
);

const BookedOnTextSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  isCalendarDate
);

export const BookedOnSchema = BookedOnTextSchema.pipe(
  Schema.decodeTo(Schema.Date, SchemaTransformation.dateFromString)
);

export type BookedOn = typeof BookedOnSchema.Type;

export const ProviderLineSchema = Schema.Struct({
  amountMinor: MinorUnitsSchema,
  bookedOn: BookedOnSchema,
  currency: CurrencyCodeSchema,
  description: Schema.String,
  providerLineId: ProviderLineIdSchema,
});

export type ProviderLine = typeof ProviderLineSchema.Type;

export const LineFieldSchema = Schema.Literals([
  "providerLineId",
  "bookedOn",
  "amountMinor",
  "currency",
  "description",
]);

export type LineField = typeof LineFieldSchema.Type;

export const RejectionReasonSchema = Schema.Literals([
  "NotAString",
  "EmptyString",
  "NotANumber",
  "NotASafeInteger",
  "NotACurrencyCode",
  "NotADate",
]);

export type RejectionReason = typeof RejectionReasonSchema.Type;

export const RejectedLineSchema = Schema.Struct({
  field: LineFieldSchema,
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  rawProviderLineId: Schema.NullOr(Schema.String),
  reason: RejectionReasonSchema,
});

export type RejectedLine = typeof RejectedLineSchema.Type;

export interface RawProviderLine {
  readonly providerLineId: unknown;
  readonly bookedOn: unknown;
  readonly amountMinor: unknown;
  readonly currency: unknown;
  readonly description: unknown;
}

export interface RawProviderPage {
  readonly lines: readonly RawProviderLine[];
  readonly nextCursor: unknown;
}
