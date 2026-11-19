import { Context, Effect, Layer } from "effect";

import type { InvestmentsUnavailable } from "./investments-unavailable.js";
import type { ExchangeRate } from "./model.js";

export class ExchangeRates extends Context.Service<
  ExchangeRates,
  {
    readonly read: () => Effect.Effect<
      readonly ExchangeRate[],
      InvestmentsUnavailable
    >;
  }
>()("@pecunia/investments/ExchangeRates") {}

export const memoryExchangeRatesLayer = (rates: readonly ExchangeRate[]) =>
  Layer.succeed(ExchangeRates, {
    read: () => Effect.succeed(rates),
  });
