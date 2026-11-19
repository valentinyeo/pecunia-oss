import { Context } from "effect";
import type { Effect } from "effect";

import type { AssetType, HoldingSymbol, Quote } from "./model.js";
import type { QuoteUnavailable } from "./quote-unavailable.js";

export class PriceBook extends Context.Service<
  PriceBook,
  {
    readonly quote: (
      symbol: HoldingSymbol,
      assetType: AssetType
    ) => Effect.Effect<Quote, QuoteUnavailable>;
  }
>()("@pecunia/investments/PriceBook") {}
