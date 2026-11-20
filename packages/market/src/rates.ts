import type { CurrencyCode } from "@pecunia/core/settings";

import type { RateQuote } from "./model.js";

export const missingQuotes = (
  requested: readonly CurrencyCode[],
  stored: readonly RateQuote[]
): readonly CurrencyCode[] =>
  requested.filter((code) => stored.every((quote) => quote.quote !== code));

export const coversDay = (
  requested: readonly CurrencyCode[],
  stored: readonly RateQuote[]
): boolean => missingQuotes(requested, stored).length === 0;

export const mergeQuotes = (
  stored: readonly RateQuote[],
  fetched: readonly RateQuote[]
): readonly RateQuote[] => {
  const known = new Set(stored.map((quote) => quote.quote));

  return [
    ...stored,
    ...fetched.filter((quote) => !known.has(quote.quote)),
  ].toSorted((left, right) => left.quote.localeCompare(right.quote));
};
