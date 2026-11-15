import { Schema } from "effect";

import { CurrencyCodeSchema } from "./primitives.js";

export class RateOnSameCurrency extends Schema.TaggedError<
  RateOnSameCurrency,
  { readonly brand: unique symbol }
>()("RateOnSameCurrency", {
  currency: CurrencyCodeSchema,
}) {
  override get message(): string {
    return `A ${this.currency} amount cannot be converted into ${this.currency} with a rate. Fix: store it with SameCurrency and no rate.`;
  }
}
