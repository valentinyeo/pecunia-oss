import { Schema } from "effect";

import {
  DateOnlySchema,
  MoneySchema,
  ProfileIdSchema,
  TaxObligationIdSchema,
  TaxProfileIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "./primitives.js";

const noObligationDetail = {
  at: Schema.optionalKey(Schema.Never),
  booksStatus: Schema.optionalKey(Schema.Never),
  reason: Schema.optionalKey(Schema.Never),
  settledBy: Schema.optionalKey(Schema.Never),
} as const;

export const TaxObligationStatusSchema = Schema.TaggedUnion({
  Estimated: { ...noObligationDetail, booksStatus: Schema.String },
  Paid: {
    ...noObligationDetail,
    at: TimestampSchema,
    settledBy: TransactionIdSchema,
  },
  WrittenOff: { ...noObligationDetail, reason: Schema.NonEmptyString },
});

export type TaxObligationStatus = typeof TaxObligationStatusSchema.Type;

export const TaxProfileSchema = Schema.Struct({
  id: TaxProfileIdSchema,
  jurisdiction: Schema.NonEmptyString,
  primary: Schema.Boolean,
  profileId: ProfileIdSchema,
  yearStart: Schema.Struct({
    day: Schema.Int.check(Schema.isBetween({ maximum: 28, minimum: 1 })),
    month: Schema.Int.check(Schema.isBetween({ maximum: 12, minimum: 1 })),
  }),
});

export type TaxProfile = typeof TaxProfileSchema.Type;

export const TaxObligationSchema = Schema.Struct({
  amount: MoneySchema,
  dueOn: DateOnlySchema,
  id: TaxObligationIdSchema,
  kind: Schema.NonEmptyString,
  label: Schema.String,
  periodEndsOn: DateOnlySchema,
  profileId: ProfileIdSchema,
  status: TaxObligationStatusSchema,
  syncedAt: TimestampSchema,
  taxProfileId: TaxProfileIdSchema,
});

export type TaxObligation = typeof TaxObligationSchema.Type;
