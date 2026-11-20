import { Schema } from "effect";

export class PriceSourceUnavailable extends Schema.TaggedError<
  PriceSourceUnavailable,
  { readonly brand: unique symbol }
>()("PriceSourceUnavailable", {
  reason: Schema.String,
}) {}
