import { Context } from "effect";

import type { PriceSourceService } from "./price-source.js";

export class CryptoQuotes extends Context.Service<
  CryptoQuotes,
  PriceSourceService
>()("@pecunia/investments/CryptoQuotes") {}
