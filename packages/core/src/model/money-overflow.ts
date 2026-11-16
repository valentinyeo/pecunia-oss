import { Schema } from "effect";

import type { Exact } from "./codec.js";
import { verified } from "./codec.js";
import { CurrencyCodeSchema, MinorUnitsSchema } from "./primitives.js";

const fields = {
  currency: CurrencyCodeSchema,
  left: MinorUnitsSchema,
  operation: Schema.Literals(["add", "subtract"]),
  right: MinorUnitsSchema,
};

const FieldsSchema = Schema.Struct(fields);

export type MoneyOverflowFields = Exact<typeof FieldsSchema.Type>;

export class MoneyOverflow extends Schema.TaggedError<
  MoneyOverflow,
  { readonly brand: unique symbol }
>()("MoneyOverflow", fields) {
  static of(input: MoneyOverflowFields): MoneyOverflow {
    return new MoneyOverflow(verified(FieldsSchema, input));
  }

  override get message(): string {
    return `${this.left} ${this.operation === "add" ? "+" : "-"} ${this.right} in ${this.currency} leaves the safe integer range. Fix: split the amount across two rows, or add the parts in another order that stays in range.`;
  }
}
