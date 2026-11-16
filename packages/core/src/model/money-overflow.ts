import { Schema } from "effect";

import { closedError } from "./closed-union.js";
import { CurrencyCodeSchema, MinorUnitsSchema } from "./primitives.js";

export class MoneyOverflow extends Schema.TaggedError<
  MoneyOverflow,
  { readonly brand: unique symbol }
>()("MoneyOverflow", {
  currency: CurrencyCodeSchema,
  left: MinorUnitsSchema,
  operation: Schema.Literals(["add", "subtract"]),
  right: MinorUnitsSchema,
}) {
  override get message(): string {
    return `${this.left} ${this.operation === "add" ? "+" : "-"} ${this.right} in ${this.currency} leaves the safe integer range. Fix: split the amount across two rows, or add the parts in another order that stays in range.`;
  }
}

closedError(MoneyOverflow);
