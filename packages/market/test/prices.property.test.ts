import { expect, it } from "@effect/vitest";
import { CurrencyCodeSchema } from "@pecunia/core/settings";
import type { CurrencyCode } from "@pecunia/core/settings";
import { Effect, Layer, Result, Schema } from "effect";

import { makeFakePriceSource } from "../src/fake-sources.js";
import { makeMemoryMarketStore, MarketSnapshotSchema } from "../src/memory.js";
import type { MarketSnapshot, PricedHolding } from "../src/memory.js";
import { DateOnlySchema, EpochMillisSchema } from "../src/model.js";
import type { DateOnly, EpochMillis } from "../src/model.js";
import { PriceSource } from "../src/price-source.js";
import { refreshPricesForDay } from "../src/refresh.js";
import { MarketStore } from "../src/store.js";

const CASES = 500;

const SEED = 20_260_218;

const seededRandom = (seed: number) => {
  let state = seed % 2_147_483_647;

  if (state <= 0) {
    state += 2_147_483_646;
  }

  return () => {
    state = (state * 16_807) % 2_147_483_647;

    return (state - 1) / 2_147_483_646;
  };
};

const nextRandom = seededRandom(SEED);

const pick = <Value>(values: readonly [Value, ...Value[]]): Value =>
  values[Math.floor(nextRandom() * values.length) % values.length] ?? values[0];

const intBetween = (low: number, high: number): number =>
  low + Math.floor(nextRandom() * (high - low + 1));

const currency = (code: string): CurrencyCode =>
  Schema.decodeSync(CurrencyCodeSchema)(code);

const CODES: readonly [CurrencyCode, ...CurrencyCode[]] = [
  currency("EUR"),
  currency("USD"),
  currency("GBP"),
  currency("JPY"),
];

const SYMBOL = "DEMO-X";

const HOLDING_ID = "0192f0c1-0030-7000-8000-000000000001";

const AS_OF: DateOnly = Schema.decodeSync(DateOnlySchema)("2026-02-17");

const FETCHED_AT: EpochMillis =
  Schema.decodeSync(EpochMillisSchema)(1_771_306_200_000);

const SEED_MINOR = 100;

const SEED_PRICED_AT: EpochMillis = Schema.decodeSync(EpochMillisSchema)(
  FETCHED_AT - 86_400_000
);

const seedSnapshot = (holdingCurrency: CurrencyCode): MarketSnapshot =>
  Schema.decodeSync(MarketSnapshotSchema)({
    holdings: [
      {
        currency: holdingCurrency,
        id: HOLDING_ID,
        lastPrice: { currency: holdingCurrency, minor: SEED_MINOR },
        pricedAt: SEED_PRICED_AT,
        state: "active",
        symbol: SYMBOL,
      },
    ],
    rates: [],
  });

const generatedMinor = (): number => {
  if (nextRandom() < 0.2) {
    return pick([0, 1, 99, 520_000, Number.MAX_SAFE_INTEGER]);
  }

  return intBetween(0, Number.MAX_SAFE_INTEGER);
};

const pricedHolding = (snapshot: MarketSnapshot): PricedHolding | undefined =>
  snapshot.holdings.find(
    (holding): holding is PricedHolding => holding.state !== "pending"
  );

it.effect(
  "stores an exact integer price in the holding's currency and refuses any other",
  () =>
    Effect.gen(function* priceAmounts() {
      for (let index = 0; index < CASES; index += 1) {
        const holdingCurrency = pick(CODES);
        const priceCurrency = pick(CODES);
        const minor = generatedMinor();

        const memory = yield* makeMemoryMarketStore(
          seedSnapshot(holdingCurrency)
        );

        const prices = yield* makeFakePriceSource({
          prices: new Map([[SYMBOL, { currency: priceCurrency, minor }]]),
          span: 1,
        });

        const layer = Layer.mergeAll(
          Layer.succeed(MarketStore, memory.store),
          Layer.succeed(PriceSource, prices.source)
        );

        const outcome = yield* refreshPricesForDay({
          asOf: AS_OF,
          fetchedAt: FETCHED_AT,
        }).pipe(Effect.provide(layer), Effect.result);

        if (priceCurrency !== holdingCurrency) {
          expect(Result.isFailure(outcome)).toBe(true);

          const failure = Result.isFailure(outcome)
            ? outcome.failure
            : undefined;

          const rejection =
            failure?._tag === "HoldingPriceRejected" ? failure : undefined;

          expect(rejection?._tag).toBe("HoldingPriceRejected");
          expect(rejection?.priceCurrency).toBe(priceCurrency);
          expect(rejection?.holdingCurrency).toBe(holdingCurrency);

          const stored = yield* memory.snapshot;

          expect(stored.holdings).toEqual(
            seedSnapshot(holdingCurrency).holdings
          );

          continue;
        }

        expect(Result.isSuccess(outcome)).toBe(true);
        expect(Result.isSuccess(outcome) ? outcome.success : 0).toBe(1);

        const stored = pricedHolding(yield* memory.snapshot);

        expect(stored?.lastPrice).toEqual({
          currency: holdingCurrency,
          minor,
        });
        expect(stored?.lastPrice.minor).toBe(minor);
        expect(Number.isSafeInteger(stored?.lastPrice.minor)).toBe(true);
        expect(stored?.pricedAt).toBe(FETCHED_AT);
      }
    })
);
