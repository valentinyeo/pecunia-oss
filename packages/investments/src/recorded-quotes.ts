import { Effect, Layer, Option, Result, Schema } from "effect";

import { CryptoQuotes } from "./crypto-quotes.js";
import { moneyOfText } from "./decimal.js";
import { MarketQuotes } from "./market-quotes.js";
import {
  CurrencyCodeSchema,
  HoldingSymbolSchema,
  TimestampSchema,
} from "./model.js";
import type { AssetType, QuoteSource } from "./model.js";
import type { PriceSourceService } from "./price-source.js";
import { PriceBook } from "./prices.js";
import { QuoteUnavailable } from "./quote-unavailable.js";

export const RecordedQuoteRowSchema = Schema.Struct({
  asOf: TimestampSchema,
  currency: CurrencyCodeSchema,
  price: Schema.String,
  symbol: HoldingSymbolSchema,
});

export type RecordedQuoteRow = typeof RecordedQuoteRowSchema.Type;

export const sourceForAssetType = (assetType: AssetType): QuoteSource =>
  assetType === "crypto" ? "crypto" : "market";

const quoteUnavailable = (symbol: string, message: string) =>
  new QuoteUnavailable({
    message,
    repair:
      "Record a quote for this symbol from the same source its asset type uses.",
    symbol: Schema.decodeSync(HoldingSymbolSchema)(symbol),
  });

const serviceOf = (
  kind: QuoteSource,
  rows: readonly unknown[]
): PriceSourceService => {
  const table = new Map<string, RecordedQuoteRow>();

  for (const row of rows) {
    const parsed = Schema.decodeUnknownResult(RecordedQuoteRowSchema)(row);

    if (Result.isSuccess(parsed)) {
      table.set(parsed.success.symbol, parsed.success);
    }
  }

  return {
    kind,
    quote: Effect.fn(`recorded${kind}Quote`)(function* quote(symbol) {
      const row = table.get(symbol);

      if (row === undefined) {
        return yield* quoteUnavailable(
          symbol,
          `No ${kind} quote is recorded for ${symbol}.`
        );
      }

      const price = moneyOfText(row.price, row.currency);

      if (Option.isNone(price)) {
        return yield* quoteUnavailable(
          symbol,
          `The recorded ${kind} quote for ${symbol} has no exact price in ${row.currency}.`
        );
      }

      return {
        asOf: row.asOf,
        price: price.value,
        source: kind,
        symbol: row.symbol,
      };
    }),
  };
};

export const recordedMarketQuotes = (rows: readonly unknown[]) =>
  Layer.succeed(MarketQuotes, serviceOf("market", rows));

export const recordedCryptoQuotes = (rows: readonly unknown[]) =>
  Layer.succeed(CryptoQuotes, serviceOf("crypto", rows));

export const priceBookLayer = Layer.effect(
  PriceBook,
  Effect.gen(function* makePriceBook() {
    const market = yield* MarketQuotes;

    const crypto = yield* CryptoQuotes;

    return PriceBook.of({
      quote: (symbol, assetType) =>
        sourceForAssetType(assetType) === "crypto"
          ? crypto.quote(symbol)
          : market.quote(symbol),
    });
  })
);
