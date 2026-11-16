# `@pecunia/bank-import`

One job: turn a demo bank CSV file into transactions that belong to one account, and never keep the same line twice.

## The demo file format

Made-up demo values only. The header is required, in this order, and it is matched case-insensitively after trimming:

```text
date,description,amount_minor,currency,reference
2026-01-06,Invoice payment from Example Ltd,480000,EUR,DEMO-2026-0001
2026-01-09,"Demo Cloud Hosting, monthly",-29900,EUR,DEMO-2026-0002
```

- `date` is a real calendar date, `YYYY-MM-DD`.
- `description` is 1 to 120 printable characters.
- `amount_minor` is a signed integer of minor units, `-?` then digits, bounded by ±9007199254740991. Pecunia never reads a decimal point out of a bank file, so no float touches an amount.
- `currency` is three uppercase letters and must equal the account's base currency, because this import holds no exchange rate.
- `reference` may be empty and is at most 64 printable characters.

Fields may be separated by `,` or `;`, quoted with `"` and `""` for a literal quote, and lines may end in `\n` or `\r\n`. Blank lines are skipped and a leading byte-order mark is ignored.

## Why importing twice adds nothing

Each parsed line becomes a fingerprint: SHA-256 over the date, description, minor amount, currency, and reference joined by a unit separator, printed as `csv-<64 hex characters>`. The ledger keeps one transaction per account and fingerprint, so a reordered, re-quoted, or semicolon-separated copy of the same file adds nothing. That is the same key shape as the `transactions_account_external_idx` unique index on `(provider_account_id, external_id)`, so the database enforces the rule the memory ledger states.

## Rejected lines

A line that breaks a rule is reported in `ImportSummary.rejected` with its 1-based line number and one named reason: `bad-amount`, `bad-currency`, `bad-date`, `blank-description`, `field-count`, `foreign-currency`, `non-printable`, or `over-long`. A rejected line never reaches the ledger. Importing the file again reports the same rejections, which keeps `imported + alreadyImported + rejected.length` equal to the file's data lines.

A whole file is refused with `BankFileRejected` when it is `empty`, has the wrong `header`, or holds `no-rows` under the header.
