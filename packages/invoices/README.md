# @pecunia/invoices

Invoice documents, attached to the payment they belong to, and the archive that keeps the file. The tables already exist in `packages/database` (`invoice_documents`, `archive_targets`); this package is the behaviour on top of them.

## What it guarantees

- **A document attaches to one payment.** `attachInvoice` links a stored document to one payment in the same profile. Attaching the same pair twice returns the document unchanged; a document that is already attached elsewhere is refused with `InvoiceAlreadyAttached`, so a wrong link is never overwritten. `@pecunia/access` authorizes the write first, so a viewer gets `Forbidden` before any store call.
- **One payment can hold more than one document.** The migration keeps a plain index on `transaction_id` on purpose: a payment may carry a receipt next to its invoice. Matching never proposes a payment that already has a document, so a proposal is always actionable.
- **Matching is a proposal, never a guess.** `matchInvoices` pairs an unattached document with an open payment when both carry the same vendor payee and the document date is within five days of the payment date, inclusive. Each document and each payment appears in at most one proposal, nearest date first, and the order is stable. Nothing is written.
- **The archive place is user data.** `readArchivePlaces` and `saveArchivePlace` read and write the profile's provider, root folder reference and blocklist. No folder id is compiled into the app. One place exists per profile and provider, so saving again replaces its root and blocklist and keeps its id. Root references and blocklist entries are trimmed; a blank entry or a repeated entry is refused.
- **The archive is a two-step state.** `reserveInvoiceArchive` moves a fresh or previously failed document to `Reserved` with the file id and place it was written to. `recordInvoiceArchive` then records `Archived` with the instant, or `Failed` with the written reason. A document can only leave `Reserved` through one of those two outcomes. Recording `Archived` again keeps the first instant, and recording the same `Failed` reason again returns the document unchanged. `Failed` keeps only the reason and clears the file id and place.
- **Money never changes.** The document amount is an exact integer of minor units with a three letter currency code, kept as it was stored. Attaching never compares it with the payment amount: a vendor can invoice in one currency and the card can charge in another (the demo design tool payment is 2999 USD charged as 2765 EUR). There is no float, no rounding and no conversion in this package.
- **Every row stays in its profile.** Every store call takes the acting profile and filters on it. A document from another profile answers `UnknownInvoice`, never another profile's row.
- **The states match the database checks.** `Unarchived`, `Reserved`, `Archived` and `Failed` are separate union members with only their own fields, matching the `invoice_documents_*_check` constraints. The D1 store maps each tag to `archive_state` and its columns one to one, apart from the renames listed below.

## Shape

- `InvoiceDocument`: id, profile, content type, filename, R2 key, SHA-256, size in bytes, document date and type, source, optional amount, optional payment id, optional vendor payee id, and the archive state.
- `Payment`: id, profile, amount, `paidOn` date, optional payee id. A D1 adapter maps this from `transactions`, and the amount is the transaction's own amount (`source_minor`/`source_currency`), never the base conversion.
- `ArchivePlace`: id, profile, provider (`drive`, `local` or `none`), root reference, blocklist.
- `InvoiceStore` is the port. `memoryInvoiceStoreLayer` is the reference adapter.

## Concurrency

`attachInvoice`, `reserveInvoiceArchive` and `recordInvoiceArchive` read the document, check the rule, then save the new row. The memory adapter serializes writes with a semaphore, but not the read that precedes them, so it assumes one writer per profile. That is enough for tests and local runs.

The D1 adapter has to close that gap with conditional writes: attach as `UPDATE invoice_documents SET transaction_id = ? WHERE profile_id = ? AND id = ? AND transaction_id IS NULL`, and each archive transition as a `WHERE archive_state = <expected tag>` update. The port will grow a conditional method when that adapter lands. Until then, do not run two writers against one profile.

## What this does not share with `@pecunia/core`

`packages/core/src/model/invoice.ts` owns the canonical entity shapes, but it exposes codec handles rather than plain schemas, and its ids and instants are branded differently. This cartridge owns its own boundary schemas and records the drift here instead of hiding it:

- `Amount` is branded `InvoiceAmount` with a 3-letter currency code and integer minor units. Core calls the same value `Money`.
- The archive target is `placeId` here and `targetId` in core.
- `archivedAt` is an integer of epoch milliseconds, mirroring the integer column. Core's `Timestamp` is an ISO string with milliseconds.
- The document omits core's `r2Key`-adjacent `createdAt` and core's `InvoiceSource` and `InvoiceException`, which no capability in this slice reads.

## Capabilities

`attachInvoice`, `matchInvoices`, `readArchivePlaces`, `saveArchivePlace`, `reserveInvoiceArchive`, `recordInvoiceArchive`. The reads need the `read` scope; the rest need `write`. `packages/capability` projects the same list onto RPC, HTTP, MCP and code mode.

## Demo

`@pecunia/invoices/demo` holds made-up fixtures that follow the demo book in `packages/database/demo/seed.sql`: a cloud hosting invoice already attached and archived, an unarchived design tool receipt that is not attached, the demo profile's local archive place, and three demo payments. The test suite attaches the design receipt to its demo payment, matches nothing afterwards, and archives it in the place the demo profile chose. A second place comes from `saveArchivePlace`, not from a fixture.

## Checks

```sh
pnpm exec vitest run --root packages/invoices
pnpm --filter @pecunia/invoices typecheck
pnpm exec oxlint packages/invoices
pnpm exec oxfmt --check packages/invoices
```

The property tests use a seeded generator inside the test file: 600 date pairs checked against Effect `DateTime`, 600 generated books checked for one-to-one matching across payees and profiles, 600 amounts checked to the minor unit through the attach path, 600 archive transitions checked against the state rules, 600 generated archive histories checked for a legal state after every step, and 600 blocklists and root references checked for trimming and duplicates.
