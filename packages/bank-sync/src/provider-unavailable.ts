import { Schema } from "effect";

export class ProviderUnavailable extends Schema.TaggedError<
  ProviderUnavailable,
  { readonly brand: unique symbol }
>()("ProviderUnavailable", {
  reason: Schema.String,
}) {}
