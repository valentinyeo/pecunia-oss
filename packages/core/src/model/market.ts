import { Schema } from "effect";

import { closed } from "./closed-union.js";
import {
  CurrencyCodeSchema,
  DateOnlySchema,
  TimestampSchema,
} from "./primitives.js";
import { RateSchema } from "./rate.js";

export const ExchangeRateSchema = closed(
  Schema.Struct({
    asOf: DateOnlySchema,
    base: CurrencyCodeSchema,
    fetchedAt: TimestampSchema,
    quote: CurrencyCodeSchema,
    rate: RateSchema,
  })
);

export type ExchangeRate = typeof ExchangeRateSchema.Type;
