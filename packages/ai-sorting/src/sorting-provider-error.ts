import { Schema } from "effect";

export class SortingProviderError extends Schema.TaggedError<
  SortingProviderError,
  { readonly brand: unique symbol }
>()("SortingProviderError", {
  message: Schema.String,
}) {}
