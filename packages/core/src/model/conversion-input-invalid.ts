import { Schema } from "effect";

import { CurrencyCodeSchema } from "./primitives.js";

export class ConversionInputInvalid extends Schema.TaggedError<
  ConversionInputInvalid,
  { readonly brand: unique symbol }
>()("ConversionInputInvalid", {
  from: CurrencyCodeSchema,
  reason: Schema.Literals(["fractional", "not-finite", "unsafe"]),
  to: CurrencyCodeSchema,
}) {
  override get message(): string {
    return `Converting ${this.from} into ${this.to} needs whole minor units that a number holds exactly, but this amount is ${this.reason}. Fix: pass a safe integer number of minor units.`;
  }
}
