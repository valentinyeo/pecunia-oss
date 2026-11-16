import { Schema } from "effect";

export class BankFileRejected extends Schema.TaggedError<
  BankFileRejected,
  { readonly brand: unique symbol }
>()("BankFileRejected", {
  fileName: Schema.String,
  reason: Schema.Literals(["empty", "header", "no-rows"]),
}) {}
