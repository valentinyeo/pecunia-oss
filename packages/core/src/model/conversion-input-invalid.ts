import { Schema } from "effect";

import type { Exact } from "./codec.js";
import { verified } from "./codec.js";
import { CurrencyCodeSchema } from "./primitives.js";

const fields = {
  from: CurrencyCodeSchema,
  reason: Schema.Literals(["fractional", "not-finite", "unsafe"]),
  to: CurrencyCodeSchema,
};

const FieldsSchema = Schema.Struct(fields);

export type ConversionInputInvalidFields = Exact<typeof FieldsSchema.Type>;

export class ConversionInputInvalid extends Schema.TaggedError<
  ConversionInputInvalid,
  { readonly brand: unique symbol }
>()("ConversionInputInvalid", fields) {
  static of(input: ConversionInputInvalidFields): ConversionInputInvalid {
    return new ConversionInputInvalid(verified(FieldsSchema, input));
  }

  override get message(): string {
    return `Converting ${this.from} into ${this.to} needs whole minor units that a number holds exactly, but this amount is ${this.reason}. Fix: pass a safe integer number of minor units.`;
  }
}
