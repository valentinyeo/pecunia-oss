import { Schema } from "effect";

export class SubscriptionStoreError extends Schema.TaggedError<
  SubscriptionStoreError,
  { readonly brand: unique symbol }
>()("SubscriptionStoreError", {
  message: Schema.String,
  repair: Schema.String,
}) {}
