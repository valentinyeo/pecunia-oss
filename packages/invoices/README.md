# @pecunia/invoices

Invoice documents, the payments that need them, and the archive that keeps the file. The tables already exist in `packages/database` (`invoice_documents`, `archive_targets`, `invoice_sources`, `invoice_exceptions`); this package is the behaviour on top of them.

## What it guarantees

- **A document attaches to one payment.** `attachInvoice` links a stored document to one payment in the same profile. Attaching the same pair twice returns the document unchanged; a document that is already attached elsewhere is refused with `InvoiceAlreadyAttached`, so a wrong link is never overwritten. `@pecunia/access` authorizes the write first, so a viewer gets `Forbidden` before any store call.
- **One payment can hold more than one document.** The migration keeps a plain index on `transaction_id` on purpose: a payment may carry a receipt next to its invoice. Matching never proposes a payment that already has a document, so a proposal is always actionable.
- **Matching is a proposal, never a guess.** `matchInvoices` pairs an unattached document with an open payment when both carry the same vendor payee and the document date is within five days of the payment date, inclusive. Each document and each payment appears in at most one proposal, nearest date first, and the order is stable. Nothing is written.
- **Every outgoing payment has one invoice status.** `listInvoiceStatus` lists the profile's outgoing payments, newest first, with a tagged status: `Archived` when at least one attached document is archived, `Invoiced` when it holds a document that is not archived yet, `Excepted` when a written reason stands in for the document, and `Missing` otherwise. Incoming and neutral payments never appear. A month filter narrows the list, and `missingCount` counts the rows whose status is `Missing`. The same output over RPC or HTTP is the JSON invoice status feed other tools read.
- **Coverage counts month by month.** `countInvoiceCoverage` returns one row per month, newest first, with the payment count and how many of those are invoiced, excepted or missing. The three counts always add up to the month's payment total, because all four come from the same rows.
- **A written reason outranks nothing and a document outranks a reason.** `recordInvoiceException` stores one trimmed reason per payment, replacing an earlier one. A payment that already holds an invoice is refused with `InvoiceAlreadyInvoiced`, and an incoming or neutral payment is refused with `InvoiceNotPayable`, because only outgoing payments need invoices. Attaching a document later simply wins in the status, so no reason can hide an invoice.
- **The archive place is user data.** `readArchivePlaces` and `saveArchivePlace` read and write the profile's provider, root folder reference and blocklist. No folder id is compiled into the app. One place exists per profile and provider, so saving again replaces its root and blocklist and keeps its id. Root references and blocklist entries are trimmed; a blank entry or a repeated entry is refused.
- **An invoice source says where a vendor's invoices come from.** `saveInvoiceSource` maps a merchant pattern to a vendor payee and the retrieval route (portal, email, bookkeeper, two factor), with an optional portal URL, login hint and note. One source exists per profile and pattern, matched ignoring case, so saving the same pattern again replaces it and keeps its id. `deleteInvoiceSource` removes one by name. A vendor payee the profile's payments do not carry is refused with `UnknownVendorPayee`. A pattern matches a merchant by case-insensitive substring, and the status rows carry the matched source id.
- **A file is stored once per fingerprint.** `saveInvoiceFile` registers a file under its SHA-256 fingerprint and attaches it to one payment. `registerLegacyInvoices` registers up to 200 files that predate the archive and answers each with `Stored` or `Existing`, so a batch that repeats a fingerprint, or a run that repeats an earlier one, never stores a second copy. Neither path compares the file amount with the payment amount.
- **The archive is a two-step state.** `reserveInvoiceArchive` moves a fresh or previously failed document to `Reserved` with the file id and place it was written to. `recordInvoiceArchive` then records `Archived` with the instant, or `Failed` with the written reason. A document can only leave `Reserved` through one of those two outcomes. Recording `Archived` again keeps the first instant, and recording the same `Failed` reason again returns the document unchanged. `Failed` keeps only the reason and clears the file id and place.
- **One folder tree per place.** `archivePathOf` builds one deterministic path from the place root, the document date's year and month, and the file name: `<root>/<yyyy>/<mm>/<sha256 first 12>-<file name>`. Root and name segments are cleaned, so a path never carries `.`, `..`, a separator inside a segment, or a control character. Two documents with different fingerprints always get different paths. An archive place's blocklist is checked against the path before a file id is reserved, and a blocked path is refused with `ArchivePathBlocked`; an entry matches a segment by equality, a `*.suffix` name, or a `prefix*`.
- **The archive can be read and paged.** `readInvoiceDocument` returns one stored document with its storage key, content type, size, fingerprint, payment and the folder path once archived. `listArchivedDocuments` pages through archived documents newest archive instant first, then document id ascending, with a cursor carrying the instant and id of the last row, so a walk repeats nothing and drops nothing. A page holds between 1 and 200 documents. `removeInvoiceDocument` deletes the record, so the payment needs an invoice again; a copy already written into an archive place is left alone.
- **Money never changes.** The document amount is an exact integer of minor units with a three letter currency code, kept as it was stored. Attaching never compares it with the payment amount: a vendor can invoice in one currency and the card can charge in another (the demo design tool payment is 2999 USD charged as 2765 EUR). There is no float, no rounding and no conversion in this package. Status rows carry the payment's own amount and coverage counts rows, never sums.
- **Every row stays in its profile.** Every store call takes the acting profile and filters on it. A document, payment, source or archive place from another profile answers `UnknownInvoice`, `UnknownPayment`, `UnknownInvoiceSource` or `UnknownArchivePlace`, never another profile's row. A document or exception stored under another profile never changes a status row.
- **The states match the database checks.** `Unarchived`, `Reserved`, `Archived` and `Failed` are separate union members with only their own fields, matching the `invoice_documents_*_check` constraints. `PaymentInvoiceStatus` is a tagged union whose members carry only their own fields. The D1 store maps each tag to `archive_state` and its columns one to one, apart from the renames listed below.

## Shape

- `InvoiceDocument`: id, profile, content type, filename, R2 key, SHA-256, size in bytes, document date and type, source, optional amount, optional payment id, optional vendor payee id, and the archive state.
- `Payment`: id, profile, amount, direction, merchant text, `paidOn` date, optional payee id. A D1 adapter maps this from `transactions`, and the amount is the transaction's own amount (`source_minor`/`source_currency`), never the base conversion.
- `PaymentInvoiceStatus`: `Missing`, `Excepted` with its reason, `Invoiced` with at least one document id, or `Archived` with at least one document id.
- `InvoiceSource`: id, profile, pattern, optional vendor payee, retrieval route, optional portal URL, optional login hint, optional note.
- `InvoiceException`: profile, payment, written reason, recorded instant.
- `InvoiceFile`: what a caller stores: content type, filename, storage key, fingerprint, size, document date and type, source, optional amount, optional vendor payee, optional source reference. `saveInvoiceFile` adds the payment; `registerLegacyInvoices` takes a batch.
- `ArchivePlace`: id, profile, provider (`drive`, `local` or `none`), root reference, blocklist.
- `ArchivedDocuments`: a page of archived documents with their path, the next cursor, and the profile's archived total.
- `InvoiceStore` is the port. `memoryInvoiceStoreLayer` is the reference adapter and mints new document and source ids.

## Concurrency

`attachInvoice`, `saveInvoiceFile`, `removeInvoiceDocument`, `reserveInvoiceArchive` and `recordInvoiceArchive` read the document, check the rule, then save the new row. The memory adapter serializes writes with a semaphore, but not the read that precedes them, so it assumes one writer per profile. That is enough for tests and local runs.

The D1 adapter has to close that gap with conditional writes: attach as `UPDATE invoice_documents SET transaction_id = ? WHERE profile_id = ? AND id = ? AND transaction_id IS NULL`, each archive transition as a `WHERE archive_state = <expected tag>` update, and a document insert that relies on `invoice_documents_sha256_idx` for the fingerprint. The port will grow a conditional method when that adapter lands. Until then, do not run two writers against one profile. Status, coverage and archive paging read the profile's rows and page in memory; the D1 adapter pushes the month filter and the archive cursor into SQL.

## What this does not share with `@pecunia/core`

`packages/core/src/model/invoice.ts` owns the canonical entity shapes, but it exposes codec handles rather than plain schemas, and its ids and instants are branded differently. This cartridge owns its own boundary schemas and records the drift here instead of hiding it:

- `Amount` is branded `InvoiceAmount` with a 3-letter currency code and integer minor units. Core calls the same value `Money`.
- The archive target is `placeId` here and `targetId` in core. The archive path is computed, not stored, so the schema needs no new column.
- `archivedAt` is an integer of epoch milliseconds, mirroring the integer column. Core's `Timestamp` is an ISO string with milliseconds.
- `InvoiceSource` here omits core's `createdAt` and `updatedAt`, which no capability reads, and carries the retrieval route as one struct.
- `InvoiceException` here is named for the payment it excepts, with `reason` and `recordedAt` matching the columns.
- The document omits core's `createdAt`, which no capability in this package reads.

## Capabilities

`attachInvoice`, `matchInvoices`, `readArchivePlaces`, `saveArchivePlace`, `reserveInvoiceArchive`, `recordInvoiceArchive`, `listInvoiceStatus`, `countInvoiceCoverage`, `recordInvoiceException`, `readInvoiceSources`, `saveInvoiceSource`, `deleteInvoiceSource`, `saveInvoiceFile`, `registerLegacyInvoices`, `readInvoiceDocument`, `removeInvoiceDocument`, `listArchivedDocuments`. The reads need the `read` scope; the rest need `write`. `packages/capability` projects the same list onto RPC, HTTP, MCP and code mode, so every one is also a tool.

## Demo

`@pecunia/invoices/demo` holds made-up fixtures that follow the demo book in `packages/database/demo/seed.sql`: a cloud hosting invoice already attached and archived, an unarchived design tool receipt that is not attached, the demo profile's local archive place, the demo design tool invoice source, a written exception on the demo coffee payment, and four demo payments (one incoming). The tests count the missing invoices, attach the design receipt, match nothing afterwards, archive it in the place the demo profile chose, and prove the legacy import stores one copy of each fingerprint.

## Checks

```sh
pnpm exec vitest run --root packages/invoices
pnpm --filter @pecunia/invoices typecheck
pnpm exec oxlint packages/invoices
pnpm exec oxfmt --check packages/invoices
```

The tests use seeded generators inside the test file. `invoices.property.test.ts` covers dates, matching, amounts, archive transitions, archive histories and place parsing. `invoices.coverage.property.test.ts` runs 600 generated books for the status and coverage counts, and 600 archive walks for the cursor. `invoices.sources.property.test.ts` runs 600 cases each for merchant matching, source choice, folder paths and blocklist matching. `invoices.tools.test.ts` drives the new capabilities against the demo book: missing counts, coverage months, exceptions, invoice files, legacy batches, document reads, removal, sources, blocked archive paths, viewer refusals and profile isolation.
