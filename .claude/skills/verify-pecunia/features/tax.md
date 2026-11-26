# Tax

Status: partly built. `listTaxDues` and `syncTaxDues` exist in `packages/tax` with their package checks. No screen, RPC route, MCP tool, CLI command, D1 store, or live FreeAgent call reaches them yet.

## What it promises

- A tax profile says the jurisdiction and the first day of the tax year. The demo profile is `GB`, starting 6 April.
- An obligation is a named period with a due date, an amount, a status, and a books status. Status is `estimated`, `paid`, or `written_off`.
- A paid obligation points at exactly one bank line. A unique index on the settlement prevents counting one payment twice.
- A paid obligation's amount, currency, and the settling line's base amount agree. A mismatch is a named state, not a silent adjustment.
- An open obligation carries no settlement. A written-off obligation says why.
- A sync replaces only the kinds its books tool reports. A Self Assessment sync leaves every `vat` row on the same tax profile alone: it stays stored, it stays listed, and the receipt counts it in neither inserted nor removed.
- A sync records nothing unless the books tool answers cleanly. An outage never empties the list, and a payment that disappeared upstream is removed on the next clean answer.
- Pecunia records what is due and what was paid. It does not recommend a tax position.

## Capabilities

- `listTaxDues` (`packages/tax/src/capabilities.ts`) lists one profile's stored dues with the tax profiles they belong to, soonest due date first. Every kind is listed, not only Self Assessment. It is read-only, needs no approval, and `readScopeOf` refuses a caller the profile does not admit.
- `syncTaxDues` (`packages/tax/src/capabilities.ts`) fetches the Self Assessment payments due for one tax profile from its books tool and replaces only the stored rows of the reported kind. `writeScopeOf` refuses a viewer. The job is the XState machine in `packages/tax/src/sync-machine.ts`, the FreeAgent parser is `packages/tax/src/freeagent.ts`, and `packages/tax/src/memory.ts` is the reference store.

Both are implemented and tested at the package level. The screen, the D1 adapter over `tax_obligations`, the CLI command, and the MCP mount do not exist yet; the slice that adds a projection updates this page with the exact route, tool, and command. `freeagent.ts` parses a recorded `/v2/self_assessment_payments` answer; no live FreeAgent transport is here.

## Sub-features

- Tax profile with jurisdiction, year start month, year start day, and the primary profile flag.
- Obligation list with kind (`vat` and the other kinds the slice adds), period end, due date, label, amount, currency, status, and books status.
- Self Assessment payments due, fetched from FreeAgent and keyed by kind, label, period end, and due date.
- A sync receipt with inserted, removed, unchanged, and updated counters, plus the synced-at timestamp on every row it writes.
- Settlement: link a paid obligation to one bank line classified `tax_payment`.
- Written-off obligations with a reason.
- Filing and e-filing are planned. They are not part of the promise until a slice adds them.

## How to get to it (user POV)

Today: the two capabilities through their package handlers, and the demo book through SQLite. No screen or transport.

Planned: the tax section of the app. The slice that adds it names the route, and the same capability reaches MCP and the CLI.

## Driving it with the demo book

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature tax
```

The demo book has one UK tax profile and two VAT obligations: an estimated 312500 EUR minor units for the quarter ending 30 September 2025, and a paid 250000 for the quarter ending 30 June 2025, settled by `transaction-demo-09` (250000, classified `tax_payment`).

Checks this drive runs, on top of the four cross-cutting money checks:

- `tax-settles-once`: every paid obligation is settled by a `tax_payment` line of the same amount and currency.
- `tax-unpaid-has-no-settlement`: an unpaid obligation carries no settlement id.
- `tax-paid-total`: paid tax is 250000 EUR minor units.
- `tax-unpaid-total`: unpaid tax is 312500 EUR minor units.
- `tax-year`: the demo tax year is `GB`, starting 4-6.

The same drive calls both capability handlers against a separate memory book. Its FreeAgent adapter parses the recorded package demo payload; it makes no network call. A seeded VAT obligation checks that Self Assessment sync cannot replace other kinds:

- `tax-capability-lists-dues`: the stored VAT due is 312500 EUR, with the GB tax year starting 6 April.
- `tax-capability-syncs-recorded-books`: the first clean answer inserts two Self Assessment dues.
- `tax-sync-reads-back`: listing returns the untouched VAT row and the two new GBP dues, 124050 and 98000, soonest first.
- `tax-sync-removes-missing-payment`: dropping July from the recorded answer removes one due and leaves January unchanged.
- `tax-removal-reads-back`: listing retains VAT and January, with July absent.
- `tax-sync-replay-is-unchanged`: replay inserts, removes, and updates nothing; January is unchanged.
- `tax-replay-reads-back`: the stored dues remain VAT and January after replay.

`tax-drive.json` holds the observations and the adapter's successful replacement count. This proves the memory store and recorded parser, not D1 or live FreeAgent.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. For a sync change: the focused package test for each rule it touches. A `vat` row on the synced tax profile survives the sync and is still listed, a Self Assessment row the books tool no longer reports is removed, and a second sync of the same answer changes nothing.
3. For a parser change: the rejection reasons by name. An empty field is `EmptyString`, a well-formed but impossible calendar date is `NotADate`, and a currency that is not three upper-case letters is `NotACurrencyCode`, each on the field that failed.
4. A property test over generated amounts and dates if the change touches parsing: parse then print returns the same minor units, the minus sign survives, the safe-integer edge is accepted and one minor unit past it is `OutOfRange`, and any string that is not a real calendar date is refused.
5. The obligation on screen with its amount, period, due date, status, and the settling line, next to the rows, once a screen exists.
6. A focused test for settlement. The same payment cannot settle two obligations, and a paid obligation cannot be left without a line.
7. If the change computes an estimate, the inputs and the rounding are named. An estimate is not advice, and the screen must say so.

## Gotchas

- A Self Assessment sync owns only `SelfAssessment` rows. A `vat` row on the same tax profile is not the same payment, because the declaration key includes the kind. It must survive, stay listed, and stay out of the receipt.
- Paid and unpaid totals are separate. Adding them gives a number that means nothing.
- The demo tax payment is a bank line, not a second obligation. Counting both double counts 250000.
- The UK tax year starts 6 April, not 1 January. A quarterly period can cross a year boundary.
- The settlement line must be classified `tax_payment`. A line that merely mentions tax is not a settlement.
- `books_status` is a label from the source, not a boolean. Do not branch on an empty string as if it meant paid.
- An impossible date such as `2025-02-29` is `NotADate`, never `EmptyString`. A leap day that exists, such as `2024-02-29`, is kept.
- `tax_obligations.status` is limited to `estimated`, `paid`, and `written_off`. A new state needs a schema change and a numbered migration.
- The memory store is the reference adapter. It proves the reconcile and receipt rules, not that D1 keeps them.
