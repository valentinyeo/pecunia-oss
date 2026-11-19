import { Context } from "effect";

import type { PriceSourceService } from "./price-source.js";

export class MarketQuotes extends Context.Service<
  MarketQuotes,
  PriceSourceService
>()("@pecunia/investments/MarketQuotes") {}
