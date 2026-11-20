import { CurrencyCodeSchema } from "@pecunia/core/settings";
import { Schema } from "effect";

import { HoldingIdSchema } from "./model.js";

export class HoldingPriceRejected extends Schema.TaggedError<
  HoldingPriceRejected,
  { readonly brand: unique symbol }
>()("HoldingPriceRejected", {
  holdingCurrency: CurrencyCodeSchema,
  holdingId: HoldingIdSchema,
  priceCurrency: CurrencyCodeSchema,
  symbol: Schema.NonEmptyString,
}) {}
