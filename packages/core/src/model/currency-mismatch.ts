import { Schema } from "effect";

import { CurrencyCodeSchema } from "./primitives.js";

export class CurrencyMismatch extends Schema.TaggedError<
  CurrencyMismatch,
  { readonly brand: unique symbol }
>()("CurrencyMismatch", {
  left: CurrencyCodeSchema,
  right: CurrencyCodeSchema,
}) {
  override get message(): string {
    return `Cannot combine ${this.left} with ${this.right}. Fix: convert both amounts into one currency with convert().`;
  }
}
