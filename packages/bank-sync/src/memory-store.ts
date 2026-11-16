import { Effect, Layer, Ref } from "effect";

import type { CurrencyCode, ProviderId, ProviderLine } from "./model.js";
import { BankLineStore } from "./store.js";
import type { BankLineStoreService, StoreReceipt } from "./store.js";

export interface StoredProviderLine extends ProviderLine {
  readonly providerId: ProviderId;
}

export interface MemoryBankLineStore {
  readonly lines: Effect.Effect<readonly StoredProviderLine[]>;
  readonly store: BankLineStoreService;
  readonly totals: Effect.Effect<ReadonlyMap<CurrencyCode, bigint>>;
}

export const lineKey = (providerId: ProviderId, line: ProviderLine): string =>
  `${providerId}\u0000${line.providerLineId}`;

const addLines = (
  current: ReadonlyMap<string, StoredProviderLine>,
  providerId: ProviderId,
  lines: readonly ProviderLine[]
): readonly [StoreReceipt, ReadonlyMap<string, StoredProviderLine>] => {
  const entries: (readonly [string, StoredProviderLine])[] = [
    ...current.entries(),
  ];

  let duplicates = 0;
  let inserted = 0;

  for (const line of lines) {
    const key = lineKey(providerId, line);

    if (new Map(entries).has(key)) {
      duplicates += 1;
    } else {
      entries.push([key, { ...line, providerId }]);
      inserted += 1;
    }
  }

  return [{ duplicates, inserted }, new Map(entries)];
};

const totalsOf = (
  rows: ReadonlyMap<string, StoredProviderLine>
): ReadonlyMap<CurrencyCode, bigint> => {
  const totals = new Map<CurrencyCode, bigint>();

  for (const row of rows.values()) {
    totals.set(
      row.currency,
      (totals.get(row.currency) ?? 0n) + BigInt(row.amountMinor)
    );
  }

  return totals;
};

export const makeMemoryBankLineStore: Effect.Effect<MemoryBankLineStore> =
  Effect.gen(function* makeStore() {
    const rows = yield* Ref.make<ReadonlyMap<string, StoredProviderLine>>(
      new Map()
    );

    const store: BankLineStoreService = {
      storeLines: (providerId, lines) =>
        Effect.map(
          Ref.modify(rows, (current) => addLines(current, providerId, lines)),
          (receipt) => receipt
        ),
    };

    return {
      lines: Effect.map(Ref.get(rows), (current) => [...current.values()]),
      store,
      totals: Effect.map(Ref.get(rows), totalsOf),
    };
  });

export const memoryBankLineStoreLayer: Layer.Layer<BankLineStore> =
  Layer.effect(
    BankLineStore,
    Effect.gen(function* provideStore() {
      const memory = yield* makeMemoryBankLineStore;

      return memory.store;
    })
  );
