import { Schema } from "effect";

import type { Exact } from "./codec.js";
import { verified } from "./codec.js";
import { CurrencyCodeSchema } from "./primitives.js";

const fields = {
  left: CurrencyCodeSchema,
  right: CurrencyCodeSchema,
};

const FieldsSchema = Schema.Struct(fields);

export type CurrencyMismatchFields = Exact<typeof FieldsSchema.Type>;

export class CurrencyMismatch extends Schema.TaggedError<
  CurrencyMismatch,
  { readonly brand: unique symbol }
>()("CurrencyMismatch", fields) {
  static of(input: CurrencyMismatchFields): CurrencyMismatch {
    return new CurrencyMismatch(verified(FieldsSchema, input));
  }

  override get message(): string {
    return `Cannot combine ${this.left} with ${this.right}. Fix: convert both amounts into one currency with convert().`;
  }
}
