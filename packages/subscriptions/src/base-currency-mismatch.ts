import { Schema } from "effect";

import { CurrencyCodeSchema } from "./model.js";

export class BaseCurrencyMismatch extends Schema.TaggedError<
  BaseCurrencyMismatch,
  { readonly brand: unique symbol }
>()("BaseCurrencyMismatch", {
  baseCurrency: CurrencyCodeSchema,
  currency: CurrencyCodeSchema,
  message: Schema.String,
  repair: Schema.String,
}) {}
