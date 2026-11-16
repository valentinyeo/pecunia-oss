import { Schema } from "effect";

import type { Exact } from "./codec.js";
import { verified } from "./codec.js";
import { CurrencyCodeSchema } from "./primitives.js";

const fields = {
  from: CurrencyCodeSchema,
  to: CurrencyCodeSchema,
};

const FieldsSchema = Schema.Struct(fields);

export type RateUnavailableFields = Exact<typeof FieldsSchema.Type>;

export class RateUnavailable extends Schema.TaggedError<
  RateUnavailable,
  { readonly brand: unique symbol }
>()("RateUnavailable", fields) {
  static of(input: RateUnavailableFields): RateUnavailable {
    return new RateUnavailable(verified(FieldsSchema, input));
  }

  override get message(): string {
    return `No ${this.from} to ${this.to} rate is known. Fix: store the rate before converting, or keep the amount in ${this.from}.`;
  }
}
