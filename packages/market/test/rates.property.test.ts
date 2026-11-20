import { expect, it } from "@effect/vitest";
import { CurrencyCodeSchema } from "@pecunia/core/settings";
import type { CurrencyCode } from "@pecunia/core/settings";
import { Effect, Layer, Schema } from "effect";

import { asOfOf, MILLIS_PER_DAY } from "../src/calendar.js";
import { makeFakeRateSource } from "../src/fake-sources.js";
import { makeMemoryMarketStore } from "../src/memory.js";
import type { MarketSnapshot } from "../src/memory.js";
import { MarketRefreshRequestSchema, RateSchema } from "../src/model.js";
import type {
  DateOnly,
  MarketRefreshRequest,
  RateQuote,
} from "../src/model.js";
import { RateSource } from "../src/rate-source.js";
import { refreshRatesForDay } from "../src/refresh.js";
import { MarketStore } from "../src/store.js";

const CASES = 600;

const SEED = 20_260_217;

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

const BASES: readonly [CurrencyCode, ...CurrencyCode[]] = [
  currency("EUR"),
  currency("GBP"),
  currency("USD"),
];

const QUOTE_POOL: readonly [CurrencyCode, ...CurrencyCode[]] = [
  currency("CAD"),
  currency("CHF"),
  currency("JPY"),
];

const RATE_TEXTS: readonly (readonly [string, string])[] = [
  ["CAD", "1.5200"],
  ["CHF", "0.9300"],
  ["EUR", "1.0000"],
  ["GBP", "0.9000"],
  ["JPY", "172.5000"],
  ["USD", "1.1600"],
];

const testRates: ReadonlyMap<CurrencyCode, string> = new Map(
  RATE_TEXTS.map(([code, rate]) => [currency(code), rate])
);

const quotesOf = (
  count: number
): readonly [CurrencyCode, ...CurrencyCode[]] => {
  const shift = intBetween(0, QUOTE_POOL.length - 1);

  const rotated = [...QUOTE_POOL.slice(shift), ...QUOTE_POOL.slice(0, shift)];

  const [head = QUOTE_POOL[0], ...tail] = rotated;

  return [head, ...tail.slice(0, count - 1)];
};

const emptyDay: MarketSnapshot = { holdings: [], rates: [] };

const requestOf = (
  base: CurrencyCode,
  epochDays: number,
  quotes: readonly [CurrencyCode, ...CurrencyCode[]]
): MarketRefreshRequest =>
  Schema.decodeSync(MarketRefreshRequestSchema)({
    asOf: asOfOf(epochDays * MILLIS_PER_DAY),
    base,
    fetchedAt: epochDays * MILLIS_PER_DAY,
    quotes,
  });

const dayOf = (
  snapshot: MarketSnapshot,
  base: CurrencyCode,
  asOf: DateOnly
): readonly RateQuote[] =>
  snapshot.rates.find((day) => day.base === base && day.asOf === asOf)
    ?.quotes ?? [];

const codesOf = (quotes: readonly RateQuote[]): readonly string[] =>
  quotes.map((quote) => quote.quote).toSorted();

const utcDayOf = (millis: number): string =>
  // @effect-diagnostics-next-line globalDate:off -- the platform's ISO formatting is the independent oracle for the UTC day this package derives with integer arithmetic.
  new Date(millis).toISOString().slice(0, 10);

interface StoreAndSource {
  readonly fake: { readonly reads: Effect.Effect<number> };
  readonly layer: Layer.Layer<MarketStore | RateSource>;
  readonly memory: { readonly snapshot: Effect.Effect<MarketSnapshot> };
}

const storeAndSource = (): Effect.Effect<StoreAndSource> =>
  Effect.gen(function* makeStoreAndSource() {
    const memory = yield* makeMemoryMarketStore(emptyDay);
    const fake = yield* makeFakeRateSource({ rates: testRates });

    return {
      fake,
      layer: Layer.mergeAll(
        Layer.succeed(MarketStore, memory.store),
        Layer.succeed(RateSource, fake.source)
      ),
      memory,
    };
  });

it.effect(
  "fetches a day once, keeps it, merges wider asks, and never overwrites an older day",
  () =>
    Effect.gen(function* rateDays() {
      for (let index = 0; index < CASES; index += 1) {
        const base = pick(BASES);
        const epochDays = intBetween(18_262, 47_482);
        const quotes = quotesOf(intBetween(1, 3));
        const otherQuotes = quotesOf(intBetween(1, 3));
        const laterDays = epochDays + intBetween(1, 30);

        const request = requestOf(base, epochDays, quotes);
        const otherRequest = requestOf(base, epochDays, otherQuotes);
        const laterRequest = requestOf(base, laterDays, quotes);

        const { fake, layer, memory } = yield* storeAndSource();

        const first = yield* refreshRatesForDay(request).pipe(
          Effect.provide(layer)
        );

        expect(first).toEqual({ cached: false, quotes: quotes.length });
        expect(yield* fake.reads).toBe(1);
        expect(asOfOf(request.fetchedAt)).toBe(request.asOf);
        expect(utcDayOf(epochDays * MILLIS_PER_DAY)).toBe(request.asOf);

        const fresh = yield* memory.snapshot;
        const freshDay = dayOf(fresh, base, request.asOf);

        expect(fresh.rates).toHaveLength(1);
        expect(codesOf(freshDay)).toEqual([...quotes].toSorted());

        for (const quote of freshDay) {
          const decoded = yield* Schema.decodeEffect(RateSchema)(
            quote.rate
          ).pipe(Effect.orDie);

          expect(decoded).toBe(quote.rate);
        }

        const second = yield* refreshRatesForDay(request).pipe(
          Effect.provide(layer)
        );

        expect(second).toEqual({ cached: true, quotes: quotes.length });
        expect(yield* fake.reads).toBe(1);
        expect((yield* memory.snapshot).rates).toEqual(fresh.rates);

        const uncovered = otherQuotes.filter((code) => !quotes.includes(code));

        const wider = yield* refreshRatesForDay(otherRequest).pipe(
          Effect.provide(layer)
        );

        const union = [...new Set([...quotes, ...otherQuotes])].toSorted();
        const readsAfterWider = uncovered.length === 0 ? 1 : 2;

        expect(wider).toEqual({
          cached: uncovered.length === 0,
          quotes: union.length,
        });
        expect(yield* fake.reads).toBe(readsAfterWider);

        const merged = yield* memory.snapshot;

        expect(codesOf(dayOf(merged, base, request.asOf))).toEqual(union);

        const repeat = yield* refreshRatesForDay(request).pipe(
          Effect.provide(layer)
        );

        expect(repeat.cached).toBe(true);
        expect(yield* fake.reads).toBe(readsAfterWider);

        const later = yield* refreshRatesForDay(laterRequest).pipe(
          Effect.provide(layer)
        );

        expect(later.cached).toBe(false);
        expect(yield* fake.reads).toBe(readsAfterWider + 1);

        const withLater = yield* memory.snapshot;

        expect(dayOf(withLater, base, laterRequest.asOf)).not.toEqual([]);
        expect(dayOf(withLater, base, request.asOf)).toEqual(
          dayOf(merged, base, request.asOf)
        );
        expect(
          withLater.rates.filter((day) => day.asOf === request.asOf)
        ).toHaveLength(1);
      }
    })
);
