# Invoices

Status: partly built. Seventeen capabilities exist in `packages/invoices` with their checks, against the memory store. No D1 adapter, screen, MCP tool, or CLI command reaches them yet.

## What it promises

- An invoice document is a record with a date, a type, a vendor, a content type, a size, a SHA-256 hash, and an object key. The record is what the app reads and the file lives outside the repository.
- An attached document keeps its own amount and currency, exactly as stored, in integer minor units. Attaching never converts, rounds, or compares it with the payment: a vendor can invoice in one currency and the card charge in another.
- A document attaches to one payment. A second attach to a different payment is refused by name, so a wrong link is never overwritten.
- Matching is a proposal. A document and a payment are proposed together only when they carry the same vendor payee and their dates are at most five days apart, and a proposal changes nothing until a person attaches it.
- The archive state is one of `unarchived`, `reserved`, `archived`, or `failed`. Each state carries exactly the columns it promises: a reserved document has a place and a file id, an archived document adds the instant, a failed document has only the reason, and an unarchived document has none of them.
- Every document, payment, and archive place stays inside its profile. A row from another profile answers `UnknownInvoice`, never another profile's data.
- The repository holds no invoice file, no real vendor, and no portal password. The demo portal is `portal.example.com`.

## Capabilities

- `attachInvoice` (`packages/invoices/src/capabilities.ts`) attaches one stored document to one payment in the same profile. The same pair twice returns the document unchanged, a document already attached to another payment fails with `InvoiceAlreadyAttached`, an unknown document fails with `UnknownInvoice`, and an unknown payment fails with `UnknownPayment`. The amount stays exactly as stored.
- `matchInvoices` (`packages/invoices/src/capabilities.ts`) proposes one payment for each unattached document when both sides carry the same vendor payee and their dates are at most five calendar days apart, inclusive. Each document and each payment lands in at most one proposal, nearest date first, and a payment that already has a document is never proposed. It writes nothing.
- `readArchivePlaces` (`packages/invoices/src/capabilities.ts`) lists the profile's archive places, each with its provider, root folder reference, and blocklist.
- `saveArchivePlace` (`packages/invoices/src/capabilities.ts`) saves the profile's place for one provider. Saving again keeps the place id and replaces its root and blocklist. The root and every entry are trimmed, a blank entry fails, and a repeated entry fails.
- `reserveInvoiceArchive` (`packages/invoices/src/capabilities.ts`) moves an unarchived or failed document to `Reserved` with the file id and place it was written to. The same file in the same place twice returns it unchanged, a different file or place fails with `ArchiveStateRefused`, a place whose provider is `none` fails with `ArchivePlaceUnavailable`, and an unknown place fails with `UnknownArchivePlace`.
- `recordInvoiceArchive` (`packages/invoices/src/capabilities.ts`) records the outcome of a reserved file. `Archived` stamps the instant the file landed and keeps the place and file id, and recording it again keeps the first instant. `Failed` keeps the written reason and clears the place and file id, and the same reason recorded twice returns the document unchanged. Every other move is refused with `ArchiveStateRefused`, which names the state the document is in (`from`) and the state it was asked to reach (`to`).
- `listInvoiceStatus` (`packages/invoices/src/capabilities.ts`) lists the profile's outgoing payments newest first, each with a tagged status: `Archived` when an attached document is archived, `Invoiced` when it holds a document that is not archived yet, `Excepted` when a written reason stands in for the document, and `Missing` otherwise. A month narrows the list, `missingCount` counts the missing rows, and incoming and neutral payments never appear.
- `countInvoiceCoverage` (`packages/invoices/src/capabilities.ts`) returns one row per month, newest first, with the payment count and how many of those are invoiced, excepted or missing. The three counts add up to the month's total because all four come from the same rows.
- `recordInvoiceException` (`packages/invoices/src/capabilities.ts`) stores one trimmed written reason, at most 500 characters, for one outgoing payment with no invoice, and replaces an earlier reason. A blank or overlong reason fails with `InvoiceExceptionRefused` and names the length and the limit, a payment that already holds an invoice fails with `InvoiceAlreadyInvoiced`, and an incoming or neutral payment fails with `InvoiceNotPayable`.
- `readInvoiceSources` (`packages/invoices/src/capabilities.ts`) lists where each vendor's invoices come from: the merchant pattern, the vendor payee, the retrieval route (portal, email, bookkeeper, two factor), and the optional portal URL, login hint and note.
- `saveInvoiceSource` (`packages/invoices/src/capabilities.ts`) saves one source per profile and pattern, matched ignoring case, so saving the same pattern again keeps its id and replaces the vendor, route and links. A pattern is trimmed and must be non-blank, and a vendor payee the profile's payments do not carry fails with `UnknownVendorPayee`.
- `deleteInvoiceSource` (`packages/invoices/src/capabilities.ts`) deletes one source by its id. The payments and documents already stored are untouched, and an unknown id fails with `UnknownInvoiceSource`.
- `saveInvoiceFile` (`packages/invoices/src/capabilities.ts`) stores one file once per profile under its SHA-256 fingerprint and attaches it to one payment, returning the stored document instead of a second copy, and refusing to move a document already attached to another payment.
- `registerLegacyInvoices` (`packages/invoices/src/capabilities.ts`) registers up to 200 files that predate the archive in one call and answers each with `Stored` or `Existing`, so a repeated fingerprint never stores a second copy. A batch of 201 files, or a file missing a field the book stores, fails with `LegacyFilesRefused` and names the count and the limit.
- `readInvoiceDocument` (`packages/invoices/src/capabilities.ts`) returns one stored document with its storage key, content type, size, fingerprint, payment, and its path in the place's folder tree once archived. The bytes stay in the object store at the storage key.
- `removeInvoiceDocument` (`packages/invoices/src/capabilities.ts`) deletes one stored document so its payment needs an invoice again. A copy already written into an archive place is left where it is, and an unknown document fails with `UnknownInvoice`.
- `listArchivedDocuments` (`packages/invoices/src/capabilities.ts`) pages through archived documents newest archive instant first, then document id ascending, with a cursor carrying the instant and id of the last row, so a walk repeats nothing and drops nothing. A page holds between 1 and 200 documents.

All seventeen are implemented and tested at the package level in `packages/invoices/test/`: the demo book through the handlers, every boundary schema, and 600-case runs over dates, amounts, matching, archive transitions, and blocklists. Every read needs the `read` scope and every write the `write` scope, so a viewer gets `Forbidden` from a write and a person with no membership gets `Forbidden` from a read. A request field the contract cannot decode fails with `InvalidInvoiceRequest`, which names the capability, the field path, the schema's own problem sentence in `problem`, and a generic `fix` that starts with `Fix:`, all in plain strings only, never a branded id built from the bad input. `InvoiceExceptionRefused` and `LegacyFilesRefused` still answer when they name the rule better.

## Not built

- A D1 adapter. `InvoiceStore` has one adapter, the memory store in `packages/invoices/src/memory.ts`, so nothing survives a restart. The tables exist in `packages/database` and no code maps them yet.
- A screen. No route shows a payment's documents, the proposals, or an archive state.
- An MCP, CLI, or RPC mount. No app lists these seventeen capabilities, so no client reaches one.
- A real Google Drive call. The package records the file id and the state a file reached. It never uploads bytes and holds no Drive client, token, or folder lookup.
- Upload, download, and past-payment ports. `InvoiceStore` reads payments for matching and nothing else: no port stores a file or reads one back.
- A second writer per profile. `attachInvoice`, `reserveInvoiceArchive`, and `recordInvoiceArchive` read the document, check the rule, then save. The memory adapter serializes writes but not the read before them, so it assumes one writer per profile. The D1 adapter has to close that gap with conditional writes: attach as `UPDATE invoice_documents SET transaction_id = ? WHERE profile_id = ? AND id = ? AND transaction_id IS NULL`, and each archive step as a `WHERE archive_state = <expected tag>` update. Until then, do not run two writers against one profile.

## How to get to it (user POV)

Today: nowhere in the app. The seventeen capabilities answer through the package handlers against the demo fixtures, and nothing mounts them.

Planned: the invoices section of the app, with a payment's documents, the proposals waiting for a decision, and the archive state of each document. The slice that adds it names the route, and the same capabilities reach MCP and the CLI.

## Driving it with the demo book

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature invoices
```

The demo book has `Demo Cloud Hosting` as a vendor, one invoice source, one local archive target, a 299000 EUR invoice linked to `transaction-demo-02`, a 2765 EUR receipt with no bank line, and one exception on `transaction-demo-04` (4250) waiting for the vendor receipt.

Checks this drive runs, on top of the four cross-cutting money checks:

- `invoice-matches-its-line`: a linked document's amount and currency equal its line's base amount and currency.
- `invoice-exception-has-no-document`: the exception names a line with no document, and its amount is 4250.
- `invoice-unarchived`: an unarchived document names no target, file, or archived time.
- `invoice-archived`: an archived document names its target, file, and archived time.
- `invoice-archive-states`: every document's archive columns match its state.
- `invoice-vendors`: every vendor belongs to the document's profile.

The same drive calls all seventeen capability handlers against `packages/invoices/src/demo.ts`. Writes stay in that run's memory store:

- `invoices-capability-lists-status`: outgoing payments appear newest first as Excepted, Missing, and Archived.
- `invoices-capability-counts-coverage`: each month's invoiced, excepted, and missing counts add to its payment count.
- `invoices-capability-reads-places`: the local demo archive has its root and blocklist.
- `invoices-capability-reads-sources`: the demo source names its vendor portal.
- `invoices-capability-proposes-match`: the design receipt matches its payment without attaching it.
- `invoices-capability-saves-place`: saving the local place preserves its id and trims the new root.
- `invoices-place-reads-back`: rereading places returns the new root and trimmed blocklist.
- `invoices-capability-attaches-document`: attaching the EUR receipt to the USD payment preserves its 2765 EUR amount.
- `invoices-attach-reads-back`: rereading the document returns that attachment, amount, and Unarchived state.
- `invoices-capability-reserves-archive`: reserving the receipt returns Reserved.
- `invoices-reserve-reads-back`: rereading returns the reserved file and place, without an archived path.
- `invoices-capability-records-archive`: recording success returns Archived.
- `invoices-archive-reads-back`: rereading returns the archived file, timestamp, and dated path under the new root.
- `invoices-capability-pages-archive`: two one-document pages return the newly archived receipt then the older invoice, without repetition.
- `invoices-capability-records-exception`: replacing Coffee's exception trims the written reason.
- `invoices-exception-reads-back`: listing payments returns the new Excepted reason.
- `invoices-capability-saves-source`: saving the same pattern ignoring case preserves its id.
- `invoices-source-reads-back`: rereading returns the changed portal, note, and retrieval settings.
- `invoices-capability-saves-file-once`: saving the same generated demo file twice returns one attached document.
- `invoices-file-reads-back`: rereading returns its exact size, SHA-256, amount, filename, and attachment.
- `invoices-capability-registers-legacy-once`: registration returns Existing and Stored, then Existing twice on replay.
- `invoices-legacy-reads-back`: rereading the new legacy record returns its exact size, SHA-256, and unattached state.
- `invoices-capability-deletes-source`: deletion names the source that left.
- `invoices-source-delete-reads-back`: rereading sources returns none.
- `invoices-capability-removes-document`: removal names the archived receipt that left the book.
- `invoices-remove-reads-back`: listing payments shows Design missing again and preserves the other payments' statuses.

`invoices-drive.json` holds the observations and successful adapter mutation count. The two new fingerprints come from generated demo text bytes. This proves file metadata and archive records, not object storage, an upload, or a Drive copy.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. For a change to any of the seventeen capabilities: the package test that covers it (`pnpm exec vitest run --root packages/invoices`), plus the property case when the change touches dates, amounts, matching, or an archive transition.
3. For the screen slice: the payment on screen with its documents, their amounts and hashes, next to the stored rows.
4. For the archive slice: the file id, the place, and the state after each step, read back through the store. A hash in the row is not proof that the file exists.
5. For the D1 adapter: the numbered migration, the conditional write behind attach and each archive step, and the same checks run against D1. A memory adapter proves a rule, not a schema constraint.
6. No real invoice, vendor, portal, or credential in the repository or the evidence.

## Gotchas

- A document with no payment is valid. It is a receipt waiting for a line, not an error, and matching proposes a payment for it.
- An exception is not a document. `invoice_exceptions` names a payment and a reason with no file, and the demo check proves the payment behind it has no document.
- `archive_state` and the archive columns move together. A state without the fields it promises is an illegal row, and the package's four union members carry exactly those fields.
- The demo SHA-256 values are made-up runs of one digit. Do not verify them against a real file; verify that a new document's hash matches the bytes it stores.
- The demo rows happen to match their line's base amount, but attaching never checks that. The demo-book check reads stored rows; the capability keeps the document's own amount and currency.
- Matching reads the profile, the vendor payee, and the five day window only. It never reads the payment amount or the currency, as the old app did (docs: `link_invoices`), so a document in one currency can be proposed for a payment in another.
- `invoice_sources.retrieval_two_factor` is a flag about a person's workflow. It is not a credential, and no password belongs in the table.
- The package owns its own boundary schemas and records the drift from `packages/core/src/model/invoice.ts` in `packages/invoices/README.md`: `Money` against `InvoiceAmount`, `targetId` against `placeId`, and ISO instants against epoch milliseconds. Read that list before linking the two.
