import { Context } from "effect";
import type { Effect } from "effect";

import type { RateQuotes, RateRequest } from "./model.js";
import type { RateSourceUnavailable } from "./rate-source-unavailable.js";

export interface RateSourceService {
  readonly readRates: (
    request: RateRequest
  ) => Effect.Effect<RateQuotes, RateSourceUnavailable>;
}

export class RateSource extends Context.Service<
  RateSource,
  RateSourceService
>()("@pecunia/market/RateSource") {}
