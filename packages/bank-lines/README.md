# `@pecunia/bank-lines`

List, search, edit and review bank lines. One cartridge for the line a bank sync writes and a person checks.

## What it owns

- `model.ts`: the line, its amount in integer minor units, its review state, and the query, filter, edit and review schemas. Illegal states are schema failures: a crossed amount or date range, a page size outside `1..200`, a note over 500 characters.
- `query.ts`: the one place that decides what a filtered list is. Order is newest first, then id ascending, so a cursor always lands on exactly one position. A cursor carries a fingerprint of the filter and search that made it, so a cursor from another list is refused as `CursorFilterMismatch` instead of returning a wrong page. Filters touch nothing but membership; a returned line is the stored line.
- `scope.ts`: `readScopeOf` and `writeScopeOf` call `authorize` from `@pecunia/access` and return the only values the service accepts. A viewer cannot build a write scope, so a write without an owner is unrepresentable rather than a runtime check inside each handler.
- `service.ts`: `BankLineService`, the only path to the store. Editing a category, editing a note and marking a line reviewed are separate, explicit changes, so "leave it alone" and "clear it" are different values. The service never writes a line it read: it sends a patch of the fields the caller changed, and the store applies that patch to the line as it stands in one step. A whole-row write does not exist in the port, so a stale snapshot cannot overwrite a concurrent edit.
- `contracts.ts` and `capabilities.ts`: three capabilities, `listBankLines`, `editBankLine` and `reviewBankLine`, projected onto RPC (and from there HTTP, MCP and the CLI) by `packages/capability`. Every failure crosses the wire by name, including `Forbidden`, `UnknownBankLine` and `UnknownCategory`.
- `memory.ts` and `demo.ts`: the in-memory store and a made-up book for `Example Ltd` at `Demo Bank`.

## What it does not own yet

The store is in memory, so edits and reviews live as long as the process. A Cloudflare D1 store over `transactions` is the next slice: `BankLineStore` is the port it plugs into, and `packages/database` already holds the table. That adapter also decides where review state lives, which is a column the D1 schema does not have today.

Two local types stand in for `@pecunia/core`'s domain module until it lands on `main`: `Amount` (`currency` plus integer `minor`) and `DateOnly` (a `YYYY-MM-DD` string that only checks its shape, not its calendar). Replacing them is a one-file change in `model.ts`.

## Proof

`test/bank-lines.property.test.ts` runs 600 seeded cases over generated filters, searches, page sizes and cursors. Each case compares returned ids exactly against a plain reference filter written separately from `query.ts`, over generated currencies, amount ranges, text and dates, so dropping a facet of the filter fails the test. It also proves no returned line was rewritten, that the newest-first order holds, that every page fits its limit, and that a full cursor walk repeats and drops nothing. A cursor from a different filter or search is refused by name. It also runs 200 generated note edits to prove stored notes are trimmed and amounts never move. `test/bank-lines.edits.test.ts` runs a category edit loop and a note edit loop against one line, 600 rounds each, through the real memory adapter, and proves every acknowledged category and note edit is in the listing. `test/bank-lines.service.test.ts` proves the demo book lists, filters, searches, edits, reviews, refuses unknown ids and unknown categories, and stops a viewer from writing. `test/bank-lines.contracts.test.ts` proves the wire payloads parse or fail at the boundary and that the contracts project onto one RPC group.

```sh
pnpm exec vitest run packages/bank-lines/test
pnpm --filter @pecunia/bank-lines check
```
