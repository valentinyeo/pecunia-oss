import { expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";

import { CryptoQuotes } from "../src/crypto-quotes.js";
import { MarketQuotes } from "../src/market-quotes.js";
import type { AssetType, Quote, QuoteSource } from "../src/model.js";
import { HoldingSymbolSchema, QuoteSchema } from "../src/model.js";
import { PriceBook } from "../src/prices.js";
import {
  priceBookLayer,
  recordedCryptoQuotes,
  recordedMarketQuotes,
  sourceForAssetType,
} from "../src/recorded-quotes.js";

const SEED = 424_242;

const CASES = 500;

const MODULUS = 2_147_483_647;

const MULTIPLIER = 48_271;

const seeded = (seed: number) => {
  let state = seed % MODULUS;

  if (state <= 0) {
    state += MODULUS - 1;
  }

  return () => {
    state = (state * MULTIPLIER) % MODULUS;

    return (state - 1) / (MODULUS - 1);
  };
};

const next = seeded(SEED);

const intBetween = (min: number, max: number) =>
  min + Math.floor(next() * (max - min + 1));

const pick = <A>(values: readonly A[]): A => {
  const value = values[intBetween(0, values.length - 1)];

  if (value === undefined) {
    throw new Error("pick needs at least one value");
  }

  return value;
};

const quoteOf = (source: QuoteSource, symbol: string): Quote =>
  Schema.decodeSync(QuoteSchema)({
    asOf: "2026-01-05T09:00:00.000Z",
    price: { currency: "EUR", minor: 1000 },
    source,
    symbol,
  });

const answeringSource = (kind: QuoteSource) => ({
  kind,
  quote: (symbol: string) => Effect.succeed(quoteOf(kind, symbol)),
});

const market = Layer.succeed(MarketQuotes, answeringSource("market"));

const crypto = Layer.succeed(CryptoQuotes, answeringSource("crypto"));

const book = priceBookLayer.pipe(Layer.provide(Layer.merge(market, crypto)));

const worldSymbol = Schema.decodeSync(HoldingSymbolSchema)("DEMO-WORLD");

const bitcoinSymbol = Schema.decodeSync(HoldingSymbolSchema)("DEMO-BTC");

const symbols = Array.from({ length: CASES }, (_, index) =>
  Schema.decodeSync(HoldingSymbolSchema)(`SYM-${index}`)
);

const assetTypes: readonly AssetType[] = [
  "cash",
  "crypto",
  "etf",
  "fund",
  "stock",
];

it.effect(
  "routes every asset type to its own price source over 500 cases",
  () =>
    Effect.gen(function* routeQuotes() {
      const priceBook = yield* PriceBook;

      for (let index = 0; index < CASES; index += 1) {
        const assetType = pick(assetTypes);

        const symbol = symbols[index] ?? worldSymbol;

        const quote = yield* priceBook.quote(symbol, assetType);

        expect(quote.source).toBe(sourceForAssetType(assetType));

        expect(quote.source).toBe(assetType === "crypto" ? "crypto" : "market");
      }
    }).pipe(Effect.provide(book))
);

it.effect("never asks the crypto source for a share", () => {
  const asks: string[] = [];

  const recordingMarket = Layer.succeed(MarketQuotes, {
    kind: "market",
    quote: (symbol: string) => {
      asks.push(`market:${symbol}`);

      return Effect.succeed(quoteOf("market", symbol));
    },
  });

  const recordingCrypto = Layer.succeed(CryptoQuotes, {
    kind: "crypto",
    quote: (symbol: string) => {
      asks.push(`crypto:${symbol}`);

      return Effect.succeed(quoteOf("crypto", symbol));
    },
  });

  return Effect.gen(function* recordSources() {
    const priceBook = yield* PriceBook;

    yield* priceBook.quote(worldSymbol, "etf");

    yield* priceBook.quote(bitcoinSymbol, "crypto");

    expect(asks).toEqual(["market:DEMO-WORLD", "crypto:DEMO-BTC"]);
  }).pipe(
    Effect.provide(
      priceBookLayer.pipe(
        Layer.provide(Layer.merge(recordingMarket, recordingCrypto))
      )
    )
  );
});

it.effect("stays unpriced instead of falling back to the other source", () =>
  Effect.gen(function* noFallback() {
    const priceBook = yield* PriceBook;

    const failure = yield* Effect.flip(priceBook.quote(worldSymbol, "etf"));

    expect(failure._tag).toBe("QuoteUnavailable");
  }).pipe(
    Effect.provide(
      priceBookLayer.pipe(
        Layer.provide(
          Layer.merge(
            recordedMarketQuotes([]),
            recordedCryptoQuotes([
              {
                asOf: "2026-01-05T09:00:00.000Z",
                currency: "EUR",
                price: "520.00",
                symbol: "DEMO-WORLD",
              },
            ])
          )
        )
      )
    )
  )
);
