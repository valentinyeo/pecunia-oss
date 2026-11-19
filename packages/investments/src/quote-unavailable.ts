import { Schema } from "effect";

import { HoldingSymbolSchema } from "./model.js";

export class QuoteUnavailable extends Schema.TaggedError<
  QuoteUnavailable,
  { readonly brand: unique symbol }
>()("QuoteUnavailable", {
  message: Schema.String,
  repair: Schema.String,
  symbol: HoldingSymbolSchema,
}) {}
