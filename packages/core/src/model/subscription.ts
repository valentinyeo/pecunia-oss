import { Schema } from "effect";

import type { Exact } from "./codec.js";
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

export type Frequency = Exact<typeof FrequencySchema.Type>;

export const SubscriptionStatusSchema = Schema.Union([
  Schema.TaggedStruct("Cancelled", { at: TimestampSchema }),
  Schema.TaggedStruct("Confirmed", { at: TimestampSchema }),
  Schema.TaggedStruct("Detected", { at: TimestampSchema }),
  Schema.TaggedStruct("Dismissed", { at: TimestampSchema }),
  Schema.TaggedStruct("NotRecurring", { at: TimestampSchema }),
]).pipe(Schema.toTaggedUnion("_tag"));

export type SubscriptionStatus = Exact<typeof SubscriptionStatusSchema.Type>;

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

export type Subscription = Exact<typeof SubscriptionSchema.Type>;
