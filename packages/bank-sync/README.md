# @pecunia/bank-sync

One sync run against one bank account: fetch a page, parse it, store it, advance the cursor.

## The port

`BankProvider` is the seam every bank plugs into. It answers one question: give me the booked lines for this account after this cursor.

```ts
fetchPage({ accountId, cursor }) => Effect<RawProviderPage, ProviderUnavailable>
```

`RawProviderPage` carries `lines` and `nextCursor` exactly as the provider sent them, so the values are still `unknown` at that edge. `parsePage` is the only place those values become a `ProviderLine`:

- `providerLineId`: non-empty string
- `bookedOn`: a real `YYYY-MM-DD` calendar day
- `amountMinor`: a safe integer of minor units, never a float
- `currency`: three uppercase letters
- `description`: a string

A line that fails any of those checks is a `RejectedLine` with its index, the field that failed and a reason (`NotASafeInteger`, `NotACurrencyCode`, `NotADate`, and so on). The run counts it in `Synced.rejected` and never stores it. Nothing is dropped silently.

## The run

`runSync` performs four named steps and returns a typed outcome.

| Step | Retried | On failure |
| --- | --- | --- |
| `fetchPage` | yes, up to `retry.attempts` | `Failed { step: "fetchPage", reason, attempts }` |
| `parsePage` | no, it is deterministic | `Failed { step: "parsePage", reason, attempts: 1 }` |
| `storePage` | yes, up to `retry.attempts` | `Failed { step: "storePage", reason, attempts }` |
| `advanceCursor` | not a failure point | cursor moves only after `storePage` succeeds |

`RetryClock` is the sleep port. Production wires `retryClockLive`; tests wire a recorder, so no test sleeps. A `Failed` outcome carries no cursor, so the caller keeps the cursor it passed in. That is the whole cursor-safety rule: a failed page is fetched again, not skipped.

`maxPages` bounds a run so a provider that repeats a cursor cannot loop forever. A page whose `nextCursor` equals the cursor that fetched it ends the run.

## The store

`BankLineStore.storeLines(providerId, lines)` returns `{ inserted, duplicates }`. Lines are keyed by `(providerId, providerLineId)`. Running the same sync twice, or receiving overlapping or repeated pages, inserts a line once. `makeMemoryBankLineStore` is the in-memory implementation and the test seam; it also exposes the stored lines and the total per currency.

## Adapters in this package

- `makeFakeBank(script)`: deterministic scripted pages with per-page fetch failures (`failuresBeforeSuccess`) and scripted `requestCursor`/`nextCursor` links. It records the cursors it was asked for.
- `wiseRecordedProvider(pages)`: the first bank plug-in. It decodes a made-up recorded response (`wise-recorded.ts`) into the same `RawProviderPage` every other provider returns. No network, no keys, no real account data.

The recorded fixture keeps each amount as `amountMinor`. The real Wise API sends a decimal amount; that conversion belongs to the money model, which is not on `main` yet. This package does not add a second money implementation to fill the gap.

## Next slices

- A real Wise HTTP client behind this port, including the decimal-to-minor conversion through the core money type.
- Timer wiring in `apps/sync`, which already registers `SYNC_CRON` and currently returns 501 for the sync surface.
- The D1 `BankLineStore` implementation over `packages/database`.

## Checks

```sh
pnpm exec vitest run packages/bank-sync/test
pnpm --filter @pecunia/bank-sync typecheck
pnpm exec oxlint packages/bank-sync
pnpm exec oxfmt --check packages/bank-sync
```

`test/bank-sync.property.test.ts` runs a seeded generator (600 cases per property, no fast-check) over line order, page splits, repeated lines and injected fetch failures, and proves the stored set and the totals per currency match the generated set exactly once. It also proves the boundary accepts exactly the safe integer amounts, the three-letter uppercase currencies and the real calendar dates.
