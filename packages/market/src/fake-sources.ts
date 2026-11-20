import type { CurrencyCode } from "@pecunia/core/settings";
import { Effect, Layer, Ref, Schema } from "effect";

import { driftOf } from "./calendar.js";
import { PriceSchema, RateQuotesSchema, RateSchema } from "./model.js";
import type { RateQuote, SymbolPrice } from "./model.js";
import { PriceSourceUnavailable } from "./price-source-unavailable.js";
import { PriceSource } from "./price-source.js";
import type { PriceSourceService } from "./price-source.js";
import { RateSourceUnavailable } from "./rate-source-unavailable.js";
import { RateSource } from "./rate-source.js";
import type { RateSourceService } from "./rate-source.js";

const RATE_DECIMALS = 4;

const rateUnitsOf = (text: string): bigint => {
  const [whole = "0", fraction = ""] = text.split(".");
  const padded = fraction.padEnd(RATE_DECIMALS, "0").slice(0, RATE_DECIMALS);

  return BigInt(`${whole}${padded}`);
};

const rateTextOf = (units: bigint): string => {
  const text = units.toString().padStart(RATE_DECIMALS + 1, "0");
  const whole = text.slice(0, -RATE_DECIMALS);
  const fraction = text.slice(-RATE_DECIMALS).replace(/0+$/u, "");

  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
};

export const movedRate = (text: string, steps: number): string =>
  rateTextOf(rateUnitsOf(text) + BigInt(steps));

export interface DemoRateTable {
  readonly rates: ReadonlyMap<CurrencyCode, string>;
  readonly span?: number;
}

export interface FakeRateSource {
  readonly reads: Effect.Effect<number>;
  readonly source: RateSourceService;
}

export const makeFakeRateSource = (
  table: DemoRateTable
): Effect.Effect<FakeRateSource> =>
  Effect.gen(function* fakeRateSource() {
    const reads = yield* Ref.make(0);
    const span = table.span ?? 7;

    const source: RateSourceService = {
      readRates: (request) =>
        Effect.gen(function* serveRates() {
          yield* Ref.update(reads, (count) => count + 1);

          const quotes: RateQuote[] = [];

          for (const [index, quote] of request.quotes.entries()) {
            const rate = table.rates.get(quote);

            if (rate === undefined) {
              return yield* new RateSourceUnavailable({
                reason: `FakeRateSource holds no demo rate for ${quote}`,
              });
            }

            quotes.push({
              quote,
              rate: yield* Schema.decodeEffect(RateSchema)(
                movedRate(rate, driftOf(request.asOf, span) + index)
              ).pipe(Effect.orDie),
            });
          }

          return yield* Schema.decodeEffect(RateQuotesSchema)({
            asOf: request.asOf,
            base: request.base,
            quotes,
          }).pipe(Effect.orDie);
        }),
    };

    return { reads: Ref.get(reads), source };
  });

export const fakeRateSourceLayer = (table: DemoRateTable) =>
  Layer.effect(
    RateSource,
    Effect.map(makeFakeRateSource(table), (fake) => fake.source)
  );

export interface DemoPriceTable {
  readonly prices: ReadonlyMap<
    string,
    { readonly currency: CurrencyCode; readonly minor: number }
  >;
  readonly span?: number;
}

export interface FakePriceSource {
  readonly reads: Effect.Effect<number>;
  readonly source: PriceSourceService;
}

export const makeFakePriceSource = (
  table: DemoPriceTable
): Effect.Effect<FakePriceSource> =>
  Effect.gen(function* fakePriceSource() {
    const reads = yield* Ref.make(0);
    const span = table.span ?? 5;

    const source: PriceSourceService = {
      readPrices: (request) =>
        Effect.gen(function* servePrices() {
          yield* Ref.update(reads, (count) => count + 1);

          const prices: SymbolPrice[] = [];

          for (const [index, symbol] of request.symbols.entries()) {
            const price = table.prices.get(symbol);

            if (price === undefined) {
              return yield* new PriceSourceUnavailable({
                reason: `FakePriceSource holds no demo price for ${symbol}`,
              });
            }

            const minor =
              price.minor + (driftOf(request.asOf, span) + index) * 100;

            const decoded = yield* Schema.decodeEffect(PriceSchema)({
              currency: price.currency,
              minor,
            }).pipe(Effect.orDie);

            prices.push({ price: decoded, symbol });
          }

          return prices;
        }),
    };

    return { reads: Ref.get(reads), source };
  });

export const fakePriceSourceLayer = (table: DemoPriceTable) =>
  Layer.effect(
    PriceSource,
    Effect.map(makeFakePriceSource(table), (fake) => fake.source)
  );
