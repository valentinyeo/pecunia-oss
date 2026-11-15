import { Schema } from "effect";

import { CurrencyCodeSchema, MinorUnitsSchema } from "./primitives.js";
import { RateSchema, rateText } from "./rate.js";

export class ConversionOverflow extends Schema.TaggedError<
  ConversionOverflow,
  { readonly brand: unique symbol }
>()("ConversionOverflow", {
  baseCurrency: CurrencyCodeSchema,
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
  rate: RateSchema,
}) {
  override get message(): string {
    return `Converting ${this.minor} ${this.currency} at ${rateText(this.rate)} into ${this.baseCurrency} leaves the safe integer range. Fix: convert a smaller amount, or store the amount in ${this.currency}.`;
  }
}
