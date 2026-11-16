import { Schema } from "effect";

export class StoreUnavailable extends Schema.TaggedError<
  StoreUnavailable,
  { readonly brand: unique symbol }
>()("StoreUnavailable", {
  reason: Schema.String,
}) {}
