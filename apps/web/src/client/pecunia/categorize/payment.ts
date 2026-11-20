import { CategoryIdSchema } from "@pecunia/categorize";
import { Schema } from "effect";

import { Currency, MinorUnits } from "../money.js";
import { PaymentIdSchema, TimestampMillisSchema } from "./ids.js";

export const PaymentDirectionSchema = Schema.Literals(["in", "neutral", "out"]);

export type PaymentDirection = typeof PaymentDirectionSchema.Type;

export const TextFieldSchema = Schema.String.check(Schema.isMaxLength(500));

export const PaymentSourceSchema = Schema.Literals(["manual", "rule"]);

export type PaymentSource = typeof PaymentSourceSchema.Type;

export const PaymentSchema = Schema.Struct({
  amountMinor: MinorUnits,
  categoryId: Schema.NullOr(CategoryIdSchema),
  currency: Currency,
  description: TextFieldSchema,
  direction: PaymentDirectionSchema,
  id: PaymentIdSchema,
  merchant: TextFieldSchema,
  occurredAt: TimestampMillisSchema,
  reference: TextFieldSchema,
  reviewed: Schema.Boolean,
  source: PaymentSourceSchema,
});

export type Payment = typeof PaymentSchema.Type;

export const BookCurrency: typeof Currency.Type = "GBP";
