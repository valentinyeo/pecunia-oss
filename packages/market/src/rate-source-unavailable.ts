import { Schema } from "effect";

export class RateSourceUnavailable extends Schema.TaggedError<
  RateSourceUnavailable,
  { readonly brand: unique symbol }
>()("RateSourceUnavailable", {
  reason: Schema.String,
}) {}
