import { Schema } from "effect";

export class TaxDueStoreError extends Schema.TaggedError<
  TaxDueStoreError,
  { readonly brand: unique symbol }
>()("TaxDueStoreError", {
  message: Schema.String,
  repair: Schema.String,
}) {}
