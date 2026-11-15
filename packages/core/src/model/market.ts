import { Schema } from "effect";

import {
  CurrencyCodeSchema,
  DateOnlySchema,
  TimestampSchema,
} from "./primitives.js";
import { RateSchema } from "./rate.js";

export const ExchangeRateSchema = Schema.Struct({
  asOf: DateOnlySchema,
  base: CurrencyCodeSchema,
  fetchedAt: TimestampSchema,
  quote: CurrencyCodeSchema,
  rate: RateSchema,
});

export type ExchangeRate = typeof ExchangeRateSchema.Type;
