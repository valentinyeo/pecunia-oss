import { Schema } from "effect";

import {
  BaseAmountSchema,
  CategoryIdSchema,
  DateOnlySchema,
  MoneySchema,
  PayeeIdSchema,
  ProfileIdSchema,
  SubscriptionIdSchema,
  TimestampSchema,
} from "./primitives.js";

export const FrequencySchema = Schema.Literals([
  "annual",
  "monthly",
  "quarterly",
  "weekly",
]);

export type Frequency = typeof FrequencySchema.Type;

export const SubscriptionStatusSchema = Schema.TaggedUnion({
  Cancelled: { at: TimestampSchema },
  Confirmed: { at: TimestampSchema },
  Detected: { at: TimestampSchema },
  Dismissed: { at: TimestampSchema },
  NotRecurring: { at: TimestampSchema },
});

export type SubscriptionStatus = typeof SubscriptionStatusSchema.Type;

export const SubscriptionSchema = Schema.Struct({
  baseAmount: BaseAmountSchema,
  categoryId: Schema.OptionFromNullishOr(CategoryIdSchema),
  confidence: Schema.Finite,
  frequency: FrequencySchema,
  id: SubscriptionIdSchema,
  lastChargedOn: DateOnlySchema,
  nextExpectedOn: DateOnlySchema,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
  status: SubscriptionStatusSchema,
  typical: MoneySchema,
});

export type Subscription = typeof SubscriptionSchema.Type;
