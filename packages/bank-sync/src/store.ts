import { Context, Schema } from "effect";
import type { Effect } from "effect";

import type { ProviderId, ProviderLine } from "./model.js";
import type { StoreUnavailable } from "./store-unavailable.js";

export const StoreReceiptSchema = Schema.Struct({
  duplicates: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  inserted: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type StoreReceipt = typeof StoreReceiptSchema.Type;

export interface BankLineStoreService {
  readonly storeLines: (
    providerId: ProviderId,
    lines: readonly ProviderLine[]
  ) => Effect.Effect<StoreReceipt, StoreUnavailable>;
}

export class BankLineStore extends Context.Service<
  BankLineStore,
  BankLineStoreService
>()("@pecunia/bank-sync/BankLineStore") {}
