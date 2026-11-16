import { Schema } from "effect";

export class BankLineStoreError extends Schema.TaggedError<
  BankLineStoreError,
  { readonly brand: unique symbol }
>()("BankLineStoreError", {
  message: Schema.String,
  repair: Schema.String,
}) {}
