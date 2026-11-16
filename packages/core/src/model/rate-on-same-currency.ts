import { Schema } from "effect";

import type { Exact } from "./codec.js";
import { verified } from "./codec.js";
import { CurrencyCodeSchema } from "./primitives.js";

const fields = {
  currency: CurrencyCodeSchema,
};

const FieldsSchema = Schema.Struct(fields);

export type RateOnSameCurrencyFields = Exact<typeof FieldsSchema.Type>;

export class RateOnSameCurrency extends Schema.TaggedError<
  RateOnSameCurrency,
  { readonly brand: unique symbol }
>()("RateOnSameCurrency", fields) {
  static of(input: RateOnSameCurrencyFields): RateOnSameCurrency {
    return new RateOnSameCurrency(verified(FieldsSchema, input));
  }

  override get message(): string {
    return `A ${this.currency} amount cannot be converted into ${this.currency} with a rate. Fix: store it with SameCurrency and no rate.`;
  }
}
