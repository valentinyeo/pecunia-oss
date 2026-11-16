import { Schema } from "effect";

import { AmountsSchema } from "./money.js";
import {
  CategoryIdSchema,
  DateOnlySchema,
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
  amounts: AmountsSchema,
  categoryId: Schema.OptionFromNullishOr(CategoryIdSchema),
  confidence: Schema.Finite,
  frequency: FrequencySchema,
  id: SubscriptionIdSchema,
  lastChargedOn: DateOnlySchema,
  nextExpectedOn: DateOnlySchema,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
  status: SubscriptionStatusSchema,
});

export type Subscription = typeof SubscriptionSchema.Type;
