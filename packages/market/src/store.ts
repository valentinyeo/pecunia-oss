import type { CurrencyCode } from "@pecunia/core/settings";
import { Context } from "effect";
import type { Effect } from "effect";

import type { MarketStoreUnavailable } from "./market-store-unavailable.js";
import type {
  DateOnly,
  EpochMillis,
  HoldingPosition,
  HoldingPrice,
  RateQuote,
  RateSet,
} from "./model.js";

export interface MarketStoreService {
  readonly readRates: (
    base: CurrencyCode,
    asOf: DateOnly
  ) => Effect.Effect<readonly RateQuote[], MarketStoreUnavailable>;
  readonly saveRates: (
    rates: RateSet
  ) => Effect.Effect<void, MarketStoreUnavailable>;
  readonly listPositions: () => Effect.Effect<
    readonly HoldingPosition[],
    MarketStoreUnavailable
  >;
  readonly savePrices: (
    prices: readonly HoldingPrice[],
    pricedAt: EpochMillis
  ) => Effect.Effect<void, MarketStoreUnavailable>;
}

export class MarketStore extends Context.Service<
  MarketStore,
  MarketStoreService
>()("@pecunia/market/MarketStore") {}
