import { Context } from "effect";
import type { Effect } from "effect";

import type { PriceRequest, SymbolPrice } from "./model.js";
import type { PriceSourceUnavailable } from "./price-source-unavailable.js";

export interface PriceSourceService {
  readonly readPrices: (
    request: PriceRequest
  ) => Effect.Effect<readonly SymbolPrice[], PriceSourceUnavailable>;
}

export class PriceSource extends Context.Service<
  PriceSource,
  PriceSourceService
>()("@pecunia/market/PriceSource") {}
