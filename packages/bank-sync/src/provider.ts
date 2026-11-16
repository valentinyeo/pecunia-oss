import { Context } from "effect";
import type { Effect } from "effect";

import type { AccountId, Cursor, RawProviderPage } from "./model.js";
import type { ProviderUnavailable } from "./provider-unavailable.js";

export interface PageRequest {
  readonly accountId: AccountId;
  readonly cursor: Cursor | null;
}

export interface BankProviderService {
  readonly fetchPage: (
    request: PageRequest
  ) => Effect.Effect<RawProviderPage, ProviderUnavailable>;
}

export class BankProvider extends Context.Service<
  BankProvider,
  BankProviderService
>()("@pecunia/bank-sync/BankProvider") {}
