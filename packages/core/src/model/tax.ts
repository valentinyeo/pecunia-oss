import { Schema } from "effect";

import { closedUnion } from "./closed-union.js";
import {
  DateOnlySchema,
  MoneySchema,
  ProfileIdSchema,
  TaxObligationIdSchema,
  TaxProfileIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "./primitives.js";

export const TaxObligationStatusSchema = closedUnion([
  Schema.TaggedStruct("Estimated", { booksStatus: Schema.String }),
  Schema.TaggedStruct("Paid", {
    at: TimestampSchema,
    settledBy: TransactionIdSchema,
  }),
  Schema.TaggedStruct("WrittenOff", { reason: Schema.NonEmptyString }),
]).pipe(Schema.toTaggedUnion("_tag"));

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
