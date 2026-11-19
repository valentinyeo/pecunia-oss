import { Context } from "effect";
import type { Effect } from "effect";

import type { BrokerPayloadRejected } from "./broker-payload-rejected.js";
import type { BrokerUnavailable } from "./broker-unavailable.js";
import type { BrokerHolding, BrokerAccountId } from "./model.js";

export interface BrokerHoldingsService {
  readonly fetch: (
    accountId: BrokerAccountId
  ) => Effect.Effect<
    readonly BrokerHolding[],
    BrokerUnavailable | BrokerPayloadRejected
  >;
}

export class BrokerHoldings extends Context.Service<
  BrokerHoldings,
  BrokerHoldingsService
>()("@pecunia/investments/BrokerHoldings") {}
