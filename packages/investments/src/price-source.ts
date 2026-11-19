import type { Effect } from "effect";

import type { HoldingSymbol, Quote, QuoteSource } from "./model.js";
import type { QuoteUnavailable } from "./quote-unavailable.js";

export interface PriceSourceService {
  readonly kind: QuoteSource;
  readonly quote: (
    symbol: HoldingSymbol
  ) => Effect.Effect<Quote, QuoteUnavailable>;
}
