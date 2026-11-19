import { Schema } from "effect";

import { ProfileIdSchema, SubscriptionIdSchema } from "./model.js";

export class UnknownSubscription extends Schema.TaggedError<
  UnknownSubscription,
  { readonly brand: unique symbol }
>()("UnknownSubscription", {
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  subscriptionId: SubscriptionIdSchema,
}) {}
