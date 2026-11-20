import { expect, it } from "@effect/vitest";
import { CurrencyCodeSchema } from "@pecunia/core/settings";
import { Effect, Layer, Result, Schema } from "effect";

import {
  demoBaseCurrency,
  demoMarketSeed,
  demoPriceTable,
  demoQuotes,
  demoRateTable,
} from "../src/demo.js";
import type { DemoPriceTable, DemoRateTable } from "../src/fake-sources.js";
import {
  makeFakePriceSource,
  makeFakeRateSource,
} from "../src/fake-sources.js";
import type { PricedHolding, MarketSnapshot } from "../src/memory.js";
import { makeMemoryMarketStore } from "../src/memory.js";
import type { MarketRefreshSummary } from "../src/model.js";
import { PriceSource } from "../src/price-source.js";
import { RateSource } from "../src/rate-source.js";
import type { MarketRefreshFailure } from "../src/refresh.js";
import { marketRefreshRequestOf, runMarketRefresh } from "../src/refresh.js";
import { MarketStore } from "../src/store.js";

const DAY_A = 1_771_306_200_000;

const DAY_B = 1_771_392_600_000;

const hour = 3_600_000;

const currency = (code: string) => Schema.decodeSync(CurrencyCodeSchema)(code);

interface Harness {
  readonly layer: Layer.Layer<MarketStore | PriceSource | RateSource>;
  readonly memory: { readonly snapshot: Effect.Effect<MarketSnapshot> };
  readonly priceReads: Effect.Effect<number>;
  readonly rateReads: Effect.Effect<number>;
  readonly run: (
    epochMillis: number
  ) => Effect.Effect<MarketRefreshSummary, MarketRefreshFailure>;
}

interface HarnessOptions {
  readonly prices?: DemoPriceTable;
  readonly rates?: DemoRateTable;
  readonly seed?: MarketSnapshot;
}

const harness = (options: HarnessOptions = {}): Effect.Effect<Harness> =>
  Effect.gen(function* demoHarness() {
    const memory = yield* makeMemoryMarketStore(options.seed ?? demoMarketSeed);

    const rates = yield* makeFakeRateSource(options.rates ?? demoRateTable);

    const prices = yield* makeFakePriceSource(options.prices ?? demoPriceTable);

    const layer = Layer.mergeAll(
      Layer.succeed(MarketStore, memory.store),
      Layer.succeed(PriceSource, prices.source),
      Layer.succeed(RateSource, rates.source)
    );

    const run = (epochMillis: number) =>
      runMarketRefresh(
        marketRefreshRequestOf({
          base: demoBaseCurrency,
          epochMillis,
          quotes: demoQuotes,
        })
      ).pipe(Effect.provide(layer));

    return {
      layer,
      memory,
      priceReads: prices.reads,
      rateReads: rates.reads,
      run,
    };
  });

const pricedOf = (
  snapshot: MarketSnapshot,
  symbol: string
): PricedHolding | undefined => {
  const holding = snapshot.holdings.find(
    (candidate) => candidate.symbol === symbol
  );

  return holding === undefined || holding.state === "pending"
    ? undefined
    : holding;
};

const pendingOf = (snapshot: MarketSnapshot, symbol: string) =>
  snapshot.holdings.find(
    (candidate) => candidate.symbol === symbol && candidate.state === "pending"
  );

it.effect(
  "moves the demo rates and the demo prices from one day to the next",
  () =>
    Effect.gen(function* moveDemoValues() {
      const demo = yield* harness();

      const first = yield* demo.run(DAY_A);

      expect(first).toEqual({
        asOf: "2026-02-17",
        base: demoBaseCurrency,
        cached: false,
        priced: 2,
        quotes: 5,
      });

      const afterFirst = yield* demo.memory.snapshot;
      const firstWorld = pricedOf(afterFirst, "DEMO-WORLD");
      const firstBitcoin = pricedOf(afterFirst, "DEMO-BTC");

      expect(firstWorld?.lastPrice.minor).not.toBe(520_000);
      expect(firstWorld?.pricedAt).toBe(DAY_A);
      expect(firstBitcoin?.pricedAt).toBe(DAY_A);
      expect(pendingOf(afterFirst, "DEMO-TECH")).toBeDefined();
      expect(pendingOf(afterFirst, "DEMO-TECH")).not.toHaveProperty(
        "lastPrice"
      );

      const firstRate = afterFirst.rates
        .find((day) => day.asOf === "2026-02-17")
        ?.quotes.find((quote) => quote.quote === currency("USD"))?.rate;

      const second = yield* demo.run(DAY_B);

      expect(second.asOf).toBe("2026-02-18");
      expect(second.cached).toBe(false);

      const afterSecond = yield* demo.memory.snapshot;
      const secondWorld = pricedOf(afterSecond, "DEMO-WORLD");

      const secondRate = afterSecond.rates
        .find((day) => day.asOf === "2026-02-18")
        ?.quotes.find((quote) => quote.quote === currency("USD"))?.rate;

      expect(secondWorld?.lastPrice.minor).not.toBe(
        firstWorld?.lastPrice.minor
      );
      expect(secondRate).not.toBe(firstRate);
      expect(yield* demo.rateReads).toBe(2);
      expect(yield* demo.priceReads).toBe(2);
    })
);

it.effect("caches one day of rates and reprices on every tick", () =>
  Effect.gen(function* cacheADay() {
    const demo = yield* harness();

    yield* demo.run(DAY_A);

    const second = yield* demo.run(DAY_A + hour);

    expect(second.cached).toBe(true);
    expect(second.asOf).toBe("2026-02-17");
    expect(yield* demo.rateReads).toBe(1);
    expect(yield* demo.priceReads).toBe(2);

    const after = yield* demo.memory.snapshot;

    expect(pricedOf(after, "DEMO-WORLD")?.pricedAt).toBe(DAY_A + hour);
    expect(after.rates.filter((day) => day.asOf === "2026-02-17")).toHaveLength(
      1
    );
  })
);

it.effect("refuses a quote the demo rate source does not know", () =>
  Effect.gen(function* refuseUnknownQuote() {
    const demo = yield* harness({
      rates: {
        rates: new Map(
          [...demoRateTable.rates].filter(([code]) => code !== currency("CAD"))
        ),
      },
    });

    const outcome = yield* Effect.result(demo.run(DAY_A));

    expect(Result.isFailure(outcome)).toBe(true);
    expect(Result.isFailure(outcome) ? outcome.failure._tag : undefined).toBe(
      "RateSourceUnavailable"
    );
    expect((yield* demo.memory.snapshot).rates).toEqual(demoMarketSeed.rates);
    expect(yield* demo.priceReads).toBe(0);
  })
);

it.effect("refuses a price in another currency and leaves the book alone", () =>
  Effect.gen(function* refuseForeignPrice() {
    const demo = yield* harness({
      prices: {
        prices: new Map([
          ["DEMO-BTC", { currency: currency("EUR"), minor: 720_000 }],
          ["DEMO-WORLD", { currency: currency("USD"), minor: 520_000 }],
        ]),
      },
    });

    const outcome = yield* Effect.result(demo.run(DAY_A));

    expect(Result.isFailure(outcome)).toBe(true);

    const failure = Result.isFailure(outcome) ? outcome.failure : undefined;

    expect(failure?._tag).toBe("HoldingPriceRejected");
    expect(
      failure?._tag === "HoldingPriceRejected"
        ? [failure.holdingCurrency, failure.priceCurrency, failure.symbol]
        : []
    ).toEqual([currency("EUR"), currency("USD"), "DEMO-WORLD"]);
    expect((yield* demo.memory.snapshot).holdings).toEqual(
      demoMarketSeed.holdings
    );
  })
);

it.effect("has nothing to price when every holding is pending", () =>
  Effect.gen(function* priceNothing() {
    const pendingOnly = demoMarketSeed.holdings.filter(
      (holding) => holding.state === "pending"
    );

    const demo = yield* harness({
      seed: { holdings: pendingOnly, rates: [] },
    });

    const summary = yield* demo.run(DAY_A);

    expect(summary.priced).toBe(0);
    expect(yield* demo.priceReads).toBe(0);
  })
);
