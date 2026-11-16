import { Schema } from "effect";

import type { Exact } from "./codec.js";
import { verified } from "./codec.js";
import { CurrencyCodeSchema, MinorUnitsSchema } from "./primitives.js";
import { RateSchema, rateText } from "./rate.js";

const fields = {
  baseCurrency: CurrencyCodeSchema,
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
  rate: RateSchema,
};

const FieldsSchema = Schema.Struct(fields);

export type ConversionOverflowFields = Exact<typeof FieldsSchema.Type>;

export class ConversionOverflow extends Schema.TaggedError<
  ConversionOverflow,
  { readonly brand: unique symbol }
>()("ConversionOverflow", fields) {
  static of(input: ConversionOverflowFields): ConversionOverflow {
    return new ConversionOverflow(verified(FieldsSchema, input));
  }

  override get message(): string {
    return `Converting ${this.minor} ${this.currency} at ${rateText(this.rate)} into ${this.baseCurrency} leaves the safe integer range. Fix: convert a smaller amount, or store the amount in ${this.currency}.`;
  }
}
