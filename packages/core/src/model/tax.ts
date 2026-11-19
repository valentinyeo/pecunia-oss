import { Schema } from "effect";

import type { Exact } from "./codec.js";
import {
  DateOnlySchema,
  MoneySchema,
  ProfileIdSchema,
  TaxObligationIdSchema,
  TaxProfileIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "./primitives.js";

export const TaxObligationStatusSchema = Schema.Union([
  Schema.TaggedStruct("Estimated", { booksStatus: Schema.String }),
  Schema.TaggedStruct("Paid", {
    at: TimestampSchema,
    settledBy: TransactionIdSchema,
  }),
  Schema.TaggedStruct("WrittenOff", { reason: Schema.NonEmptyString }),
]).pipe(Schema.toTaggedUnion("_tag"));

export type TaxObligationStatus = Exact<typeof TaxObligationStatusSchema.Type>;

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

export type TaxProfile = Exact<typeof TaxProfileSchema.Type>;

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

export type TaxObligation = Exact<typeof TaxObligationSchema.Type>;
