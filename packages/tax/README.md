# `@pecunia/tax`

The Self Assessment payments a profile owes, synced from its books tool. One cartridge for the due date a person asks an assistant about.

## What it owns

- `model.ts`: the due is core's `TaxObligation` row (`@pecunia/core/model`) with an amount in integer minor units, a `dueOn` and `periodEndsOn` calendar date, a books status and the profile plus tax profile that own it. Requests, the list answer and the sync receipt are schemas, so a payload that does not fit fails at the boundary.
- `amount.ts`: the one place a books tool's decimal text becomes minor units. It reads `minorUnitExponent` from core's money module, works in `BigInt`, refuses a separator other than `.`, refuses more fraction digits than the currency holds, and refuses a value a JavaScript number cannot hold exactly. `decimalTextOf` is the inverse and the property test round-trips both directions.
- `freeagent.ts`: the first plug-in books tool. It parses a recorded `/v2/self_assessment_payments` answer: a decimal `amount_due`, a three letter `currency`, real `period_ends_on` and `due_on` dates where the due date is on or after the period it closes, and a non-empty `status`. A payment it cannot store is named by field and reason instead of being dropped, because a silently dropped due would disappear from the store.
- `tax-books.ts`: `TaxBooks`, the port. A second books tool supplies one more `booksTool` member and an adapter; nothing else changes.
- `dues.ts`: the natural key of an upstream payment, `taxProfileId`, `kind`, `label`, `periodEndsOn` and `dueOn`, which is exactly the `tax_obligations_period_idx` unique index in `packages/database`. The amount and the books status are not part of identity, so a re-quote updates a row instead of adding one.
- `store.ts` and `memory.ts`: `TaxDueStore` replaces the stored set for one tax profile with the set the books tool just returned. A payment still upstream keeps its row id, a changed amount or status is updated, a payment missing upstream is removed, and a tax profile owned by another profile is refused by name. The memory adapter is the reference; the port is what a D1 adapter will plug into.
- `sync-machine.ts`: the sync is an XState machine (`createEffectActor`, declared `createEffectLogic` actors, `watchActor`): fetch, then record. The store is only touched after the books tool answers cleanly, so an outage or a bad payload leaves the stored dues alone.
- `scope.ts`, `service.ts`, `contracts.ts`, `capabilities.ts`: `readScopeOf` and `writeScopeOf` wrap `authorize` from `@pecunia/access`, so a viewer can read dues and cannot sync them. Two capabilities, `listTaxDues` and `syncTaxDues`, project onto RPC, HTTP, MCP and the CLI through `packages/capability`; `listTaxDues` is the assistant's "what is due" tool and is read-only.
- `demo.ts`: a made-up `Example Ltd` Self Assessment book for the demo profile, two GBP payments due 31 January 2026 and 31 July 2026, read from a recorded FreeAgent answer.

## What it does not own yet

- No D1 adapter. `TaxDueStore` is the port; `packages/database` already holds `tax_obligations`, including the unique index this store's key mirrors.
- No transport to FreeAgent. The adapter parses the recorded answer an HTTP client will return; the client and its credentials are a later slice.
- No composition root. `taxDueCapabilities` and `demoTaxDueLayer` are ready for `apps/cli/src/surfaces.ts`, `apps/api/src/rpc-worker.ts` or a web feature; mounting them is the surfaces slice's line to add, the same as `@pecunia/bank-lines` today.
- Reconciliation against bank lines is out of scope: a due is `Estimated` until a later slice matches the payment to a transaction.

## Proof

`test/tax.property.test.ts` runs 600 seeded cases twice. The first loop round-trips generated amounts for currencies with 0, 2 and 3 fraction digits through decimal text and back, and refuses comma, space, non-breaking space and apostrophe separators and one digit too many. The second loop generates books-tool answers (0 to 4 payments, generated amounts and dates including 29 February), syncs them, and proves the stored set is exactly the upstream set, the second sync changes nothing, a dropped payment disappears, a re-quoted amount is updated, and another profile's due is untouched. Planting a bug in the removal count fails that loop.

`test/tax.service.test.ts` proves the demo profile lists two due dates, a payment that disappears upstream is removed, a changed amount keeps its row id, a bad answer leaves the store alone, a comma amount, a due date before its period end and the same payment twice are refused by field and reason, an unavailable books tool and a foreign tax profile fail by name, a viewer can read but not sync, and a non-member is refused.

`test/tax.contracts.test.ts` proves the wire requests parse or fail, both contracts project onto one RPC group, `listTaxDues` is read-only, neither capability needs approval, both appear as assistant tools, and the natural key ignores the amount.

```sh
pnpm exec vitest run --root packages/tax
pnpm --filter @pecunia/tax check
```
