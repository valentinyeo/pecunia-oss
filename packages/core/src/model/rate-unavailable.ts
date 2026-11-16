import { Schema } from "effect";

import { closedError } from "./closed-union.js";
import { CurrencyCodeSchema } from "./primitives.js";

export class RateUnavailable extends Schema.TaggedError<
  RateUnavailable,
  { readonly brand: unique symbol }
>()("RateUnavailable", {
  from: CurrencyCodeSchema,
  to: CurrencyCodeSchema,
}) {
  override get message(): string {
    return `No ${this.from} to ${this.to} rate is known. Fix: store the rate before converting, or keep the amount in ${this.from}.`;
  }
}

closedError(RateUnavailable);
