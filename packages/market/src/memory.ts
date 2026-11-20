import { CurrencyCodeSchema } from "@pecunia/core/settings";
import { Effect, Layer, Ref, Schema } from "effect";

import {
  EpochMillisSchema,
  HoldingIdSchema,
  PriceSchema,
  RateSetSchema,
} from "./model.js";
import type {
  EpochMillis,
  HoldingPosition,
  HoldingPrice,
  RateSet,
} from "./model.js";
import { MarketStore } from "./store.js";
import type { MarketStoreService } from "./store.js";

const holdingFields = {
  currency: CurrencyCodeSchema,
  id: HoldingIdSchema,
  symbol: Schema.NonEmptyString,
} as const;

export const PendingHoldingSchema = Schema.Struct({
  ...holdingFields,
  state: Schema.Literal("pending"),
});

export type PendingHolding = typeof PendingHoldingSchema.Type;

export const PricedHoldingSchema = Schema.Struct({
  ...holdingFields,
  lastPrice: PriceSchema,
  pricedAt: EpochMillisSchema,
  state: Schema.Literals(["active", "closed"]),
});

export type PricedHolding = typeof PricedHoldingSchema.Type;

export const StoredHoldingSchema = Schema.Union([
  PendingHoldingSchema,
  PricedHoldingSchema,
]);

export type StoredHolding = typeof StoredHoldingSchema.Type;

export const MarketSnapshotSchema = Schema.Struct({
  holdings: Schema.Array(StoredHoldingSchema),
  rates: Schema.Array(RateSetSchema),
});

export type MarketSnapshot = typeof MarketSnapshotSchema.Type;

export interface MemoryMarketStore {
  readonly snapshot: Effect.Effect<MarketSnapshot>;
  readonly store: MarketStoreService;
}

const dayKey = (base: string, asOf: string): string => `${base}\u0000${asOf}`;

const withDay = (days: readonly RateSet[], next: RateSet): readonly RateSet[] =>
  [
    ...days.filter(
      (day) => dayKey(day.base, day.asOf) !== dayKey(next.base, next.asOf)
    ),
    next,
  ].toSorted((left, right) =>
    dayKey(left.base, left.asOf).localeCompare(dayKey(right.base, right.asOf))
  );

const pricedHolding = (
  holding: StoredHolding,
  prices: ReadonlyMap<string, HoldingPrice>,
  pricedAt: EpochMillis
): StoredHolding => {
  const price = prices.get(holding.id);

  return price === undefined || holding.state === "pending"
    ? holding
    : { ...holding, lastPrice: price.price, pricedAt };
};

export const makeMemoryMarketStore = (
  seed: MarketSnapshot
): Effect.Effect<MemoryMarketStore> =>
  Effect.gen(function* memoryMarketStore() {
    const rates = yield* Ref.make<readonly RateSet[]>(seed.rates);

    const holdings = yield* Ref.make<readonly StoredHolding[]>(seed.holdings);

    const store: MarketStoreService = {
      listPositions: () =>
        Effect.map(Ref.get(holdings), (stored) =>
          stored.flatMap((holding) =>
            holding.state === "pending"
              ? []
              : [
                  {
                    currency: holding.currency,
                    id: holding.id,
                    symbol: holding.symbol,
                  } satisfies HoldingPosition,
                ]
          )
        ),
      readRates: (base, asOf) =>
        Effect.map(Ref.get(rates), (stored) => {
          const day = stored.find(
            (candidate) => candidate.base === base && candidate.asOf === asOf
          );

          return day?.quotes ?? [];
        }),
      savePrices: (prices, pricedAt) =>
        Effect.gen(function* savePrices() {
          const byId = new Map<string, HoldingPrice>(
            prices.map((price) => [price.holdingId, price])
          );

          yield* Ref.update(holdings, (stored) =>
            stored.map((holding) => pricedHolding(holding, byId, pricedAt))
          );
        }),
      saveRates: (next) => Ref.update(rates, (stored) => withDay(stored, next)),
    };

    const snapshot = Effect.all({
      holdings: Ref.get(holdings),
      rates: Ref.get(rates),
    });

    return { snapshot, store };
  });

export const memoryMarketStoreLayer = (seed: MarketSnapshot) =>
  Layer.effect(
    MarketStore,
    Effect.map(makeMemoryMarketStore(seed), (memory) => memory.store)
  );
