# Invoices

Status: planned. The invoice schema, a source, an archive target, two documents, and one exception exist on `main`. No capability, screen, CLI command, or MCP tool yet.

## What it promises

- An invoice document is a file with a date, a type, a vendor, a content type, a size, a SHA-256 hash, and an object key. The metadata is the record; the file lives outside the repository.
- A linked document's amount and currency match its bank line exactly. A receipt that does not match its line is a named exception, not a quiet edit.
- An exception names the bank line and the reason the vendor has not supplied a document. Every unexplained line is visible as one.
- The archive state is one of `unarchived`, `reserved`, `archived`, or `failed`. Each state carries exactly the columns it promises: a reserved document has a target and a file id, an archived document adds the time, a failed document has a reason and no target, and an unarchived document has none of them.
- A vendor, source, and archive target stay inside the profile.
- The repository holds no invoice file, no real vendor, and no portal password. The demo portal is `portal.example.com`.

## Sub-features

- Invoice sources: match pattern, vendor payee, portal URL, login hint, and the retrieval flags for portal, email, two-factor, and bookkeeper.
- Invoice documents: document date, type (`invoice`, `receipt`, `statement`, `credit_note`, `other`), original filename, object key, content type, size, hash, amount, currency, source (`upload`, `agent`, `email`, `legacy_upload`), and source reference.
- Archive state: `unarchived`, `reserved`, `archived`, or `failed`, with target, file id, archived time, or failure reason as that state requires.
- Invoice exceptions: the line and the reason, with a recorded time.
- Retrieval from a portal or inbox is planned. It is not part of the promise until a slice adds it and the evidence for a retrieval run.

## How to get to it (user POV)

Today: nowhere. The demo book carries the documents and the exception.

Planned: the invoices section of the app, with a line's documents and the exception list. The slice that adds it names the route, and the same capability reaches MCP and the CLI.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature invoices
```

The demo book has `Demo Cloud Hosting` as a vendor, one invoice source, one local archive target, a 299000 EUR invoice linked to `transaction-demo-02`, a 2765 EUR receipt with no bank line, and one exception on `transaction-demo-04` (4250) waiting for the vendor receipt.

Checks this drive runs, on top of the four cross-cutting money checks:

- `invoice-matches-its-line`: a linked document's amount and currency equal its line's base amount and currency.
- `invoice-exception-has-no-document`: the exception names a line with no document, and its amount is 4250.
- `invoice-unarchived`: an unarchived document names no target, file, or archived time.
- `invoice-archived`: an archived document names its target, file, and archived time.
- `invoice-archive-states`: every document's archive columns match its state.
- `invoice-vendors`: every vendor belongs to the document's profile.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. The line on screen with its documents and their amounts and hashes, next to the stored rows.
3. The download or archive path exercised once, with the bytes or the object key recorded. A hash in the row is not proof that the file exists.
4. A focused test for the match and the exception: a mismatched amount is an exception or a named failure, never a silent adjustment.
5. A change that adds retrieval must show what it skipped or fetched. Network, credentials, and file writes are the side effects to observe.
6. No real invoice, vendor, portal, or credential in the repository or the evidence.

## Gotchas

- A document with no `transaction_id` is valid. It is a receipt waiting for a line, not an error.
- An exception is not a document. The exception on `transaction-demo-04` has no file, and the check proves it has no document.
- `archive_state` and the archive columns move together. A state without its target is an illegal row.
- The demo SHA-256 values are made-up runs of one digit. Do not verify them against a real file; verify that a new document's hash matches the bytes it stores.
- `invoice_sources.retrieval_two_factor` is a flag about a person's workflow. It is not a credential, and no password belongs in the table.
- The invoice amount and the line's base amount are both minor units in the same currency here. A foreign invoice compares against the base amount, not the source amount.
