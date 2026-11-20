import { CurrencyCodeSchema } from "@pecunia/core/settings";
import type { CurrencyCode } from "@pecunia/core/settings";
import { Schema } from "effect";

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const monthLength = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (monthLengths[month - 1] ?? 0);

const isCalendarDate = (text: string): boolean => {
  const [year = 0, month = 0, day = 0] = text.split("-").map(Number);

  return (
    month >= 1 && month <= 12 && day >= 1 && day <= monthLength(year, month)
  );
};

export const DateOnlySchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(isCalendarDate, {
    expected: "a calendar date that exists",
  })
).pipe(Schema.brand("DateOnly"));

export type DateOnly = typeof DateOnlySchema.Type;

export const EpochMillisSchema = Schema.Int.check(
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an instant in epoch milliseconds",
  })
).pipe(Schema.brand("EpochMillis"));

export type EpochMillis = typeof EpochMillisSchema.Type;

const ratePattern = /^\d+(?:\.\d{1,12})?$/u;

const aboveZero = (text: string): boolean => /[1-9]/u.test(text);

export const RateSchema = Schema.String.check(
  Schema.isPattern(ratePattern),
  Schema.makeFilter(aboveZero, { expected: "a rate above zero" })
).pipe(Schema.brand("Rate"));

export type Rate = typeof RateSchema.Type;

export const PriceSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
}).pipe(Schema.brand("Price"));

export type Price = typeof PriceSchema.Type;

export const HoldingIdSchema = Schema.String.check(Schema.isUUID(7)).pipe(
  Schema.brand("HoldingId")
);

export type HoldingId = typeof HoldingIdSchema.Type;

const SymbolSchema = Schema.NonEmptyString;

const distinctCodes = (codes: readonly string[]): boolean =>
  new Set(codes).size === codes.length;

export const RateRequestSchema = Schema.Struct({
  asOf: DateOnlySchema,
  base: CurrencyCodeSchema,
  quotes: Schema.NonEmptyArray(CurrencyCodeSchema),
}).check(
  Schema.makeFilter(
    (request) => request.quotes.every((quote) => quote !== request.base),
    { expected: "quotes that differ from the base currency" }
  ),
  Schema.makeFilter((request) => distinctCodes(request.quotes), {
    expected: "each quote once",
  })
);

export type RateRequest = typeof RateRequestSchema.Type;

export const RateQuoteSchema = Schema.Struct({
  quote: CurrencyCodeSchema,
  rate: RateSchema,
});

export type RateQuote = typeof RateQuoteSchema.Type;

interface RateQuotesRecord {
  readonly asOf: DateOnly;
  readonly base: CurrencyCode;
  readonly quotes: readonly RateQuote[];
}

const rateQuotesFilters = [
  Schema.makeFilter(
    (rates: RateQuotesRecord) =>
      rates.quotes.every((quote) => quote.quote !== rates.base),
    { expected: "quotes that differ from the base currency" }
  ),
  Schema.makeFilter(
    (rates: RateQuotesRecord) =>
      distinctCodes(rates.quotes.map((quote) => quote.quote)),
    { expected: "each quote once" }
  ),
  Schema.makeFilter((rates: RateQuotesRecord) => rates.quotes.length > 0, {
    expected: "at least one quote",
  }),
] as const;

const rateQuotesFields = {
  asOf: DateOnlySchema,
  base: CurrencyCodeSchema,
  quotes: Schema.Array(RateQuoteSchema),
} as const;

export const RateQuotesSchema = Schema.Struct(rateQuotesFields).check(
  ...rateQuotesFilters
);

export type RateQuotes = typeof RateQuotesSchema.Type;

export const RateSetSchema = Schema.Struct({
  ...rateQuotesFields,
  fetchedAt: EpochMillisSchema,
}).check(...rateQuotesFilters);

export type RateSet = typeof RateSetSchema.Type;

export const PriceRequestSchema = Schema.Struct({
  asOf: DateOnlySchema,
  symbols: Schema.NonEmptyArray(SymbolSchema),
});

export type PriceRequest = typeof PriceRequestSchema.Type;

export const SymbolPriceSchema = Schema.Struct({
  price: PriceSchema,
  symbol: SymbolSchema,
});

export type SymbolPrice = typeof SymbolPriceSchema.Type;

export const HoldingPositionSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  id: HoldingIdSchema,
  symbol: SymbolSchema,
});

export type HoldingPosition = typeof HoldingPositionSchema.Type;

export const HoldingPriceSchema = Schema.Struct({
  holdingId: HoldingIdSchema,
  price: PriceSchema,
});

export type HoldingPrice = typeof HoldingPriceSchema.Type;

export const MarketRefreshRequestSchema = Schema.Struct({
  asOf: DateOnlySchema,
  base: CurrencyCodeSchema,
  fetchedAt: EpochMillisSchema,
  quotes: Schema.NonEmptyArray(CurrencyCodeSchema),
}).check(
  Schema.makeFilter(
    (request) => request.quotes.every((quote) => quote !== request.base),
    { expected: "quotes that differ from the base currency" }
  ),
  Schema.makeFilter((request) => distinctCodes(request.quotes), {
    expected: "each quote once",
  })
);

export type MarketRefreshRequest = typeof MarketRefreshRequestSchema.Type;

export const MarketRefreshSummarySchema = Schema.Struct({
  asOf: DateOnlySchema,
  base: CurrencyCodeSchema,
  cached: Schema.Boolean,
  priced: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  quotes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type MarketRefreshSummary = typeof MarketRefreshSummarySchema.Type;
