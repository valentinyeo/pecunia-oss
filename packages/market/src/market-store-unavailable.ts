import { Schema } from "effect";

export class MarketStoreUnavailable extends Schema.TaggedError<
  MarketStoreUnavailable,
  { readonly brand: unique symbol }
>()("MarketStoreUnavailable", {
  reason: Schema.String,
}) {}
