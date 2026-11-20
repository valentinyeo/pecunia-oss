import { Schema } from "effect";

export const DueFieldSchema = Schema.Literals([
  "self_assessment_payments",
  "amount_due",
  "currency",
  "due_on",
  "period_ends_on",
  "status",
]);

export type DueField = typeof DueFieldSchema.Type;

export const DueRejectionReasonSchema = Schema.Literals([
  "NotAnObject",
  "NotAString",
  "EmptyString",
  "NotACurrencyCode",
  "NotADate",
  "DueBeforePeriodEnds",
  "NotADecimal",
  "TooManyFractionDigits",
  "OutOfRange",
  "DuplicateDue",
  "PaymentsMissing",
]);

export type DueRejectionReason = typeof DueRejectionReasonSchema.Type;

export const DueRejectionSchema = Schema.Struct({
  field: DueFieldSchema,
  index: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  reason: DueRejectionReasonSchema,
});

export type DueRejection = typeof DueRejectionSchema.Type;

export class TaxDuesRejected extends Schema.TaggedError<
  TaxDuesRejected,
  { readonly brand: unique symbol }
>()("TaxDuesRejected", {
  message: Schema.String,
  rejections: Schema.Array(DueRejectionSchema).check(Schema.isNonEmpty()),
  repair: Schema.String,
}) {}
