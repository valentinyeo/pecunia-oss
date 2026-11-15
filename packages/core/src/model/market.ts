import { Schema } from "effect";

import {
  CurrencyCodeSchema,
  DateOnlySchema,
  RateSchema,
  TimestampSchema,
} from "./primitives.js";

export const ExchangeRateSchema = Schema.Struct({
  asOf: DateOnlySchema,
  base: CurrencyCodeSchema,
  fetchedAt: TimestampSchema,
  quote: CurrencyCodeSchema,
  rate: RateSchema,
});

export type ExchangeRate = typeof ExchangeRateSchema.Type;
