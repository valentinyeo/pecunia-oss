# Verification proof: invoices

- Run at: 2026-11-16T15:42:33Z
- Branch: `verify-skill` at `a395bd9e`
- Node: `v24.18.0`
- Demo seed: `pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-fMspd9/demo.sqlite`
- Demo book SHA-256: `527991d3898ec8fdce1029ee97f92a7c25f955c54e2375b38566f95f32537191`
- The scratch database is deleted after the run; `proof.json` holds every observation.

## Commands

```sh
pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-fMspd9/demo.sqlite
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature invoices --label invoices-per-feature
```

## Seeded tables

```text
app_setting: 1 rows
archive_targets: 1 rows
categories: 8 rows
exchange_rates: 24 rows
holdings: 3 rows
investment_platforms: 3 rows
invoice_documents: 2 rows
invoice_exceptions: 1 rows
invoice_sources: 1 rows
members: 3 rows
merchant_aliases: 4 rows
payees: 5 rows
profiles: 2 rows
provider_accounts: 2 rows
providers: 5 rows
reports: 1 rows
rules: 7 rows
run_logs: 0 rows
subscriptions: 2 rows
sync_run_rejections: 2 rows
sync_runs: 2 rows
tax_obligations: 2 rows
tax_profiles: 1 rows
transactions: 12 rows
```

## Checks

| Check | Result | Expected | Observed |
| --- | --- | --- | --- |
| `money-is-integer-minor-units` Money is an integer of minor units | PASS | `0 wrong declarations, 0 wrong rows, 11 columns` | `0 wrong declarations, 0 wrong rows, 11 columns` |
| `currency-is-an-iso-code` Every amount carries an ISO currency code | PASS | `0 wrong currencies, 13 columns` | `0 wrong currencies, 13 columns` |
| `every-row-belongs-to-a-profile` Every row belongs to a profile and every reference resolves | PASS | `ok, 0 foreign key violations, 0 tables with orphan rows, 17 scoped tables` | `ok, 0 foreign key violations, 0 tables with orphan rows, 17 scoped tables` |
| `demo-book-holds-made-up-identities` The demo book holds made-up identities only | PASS | `0 non-placeholder emails, Demo Person,Example Ltd` | `0 non-placeholder emails, Demo Person,Example Ltd` |
| `invoice-matches-its-line` A linked invoice matches its transaction exactly | PASS | `0` | `0` |
| `invoice-exception-has-no-document` An exception names a transaction with no document | PASS | `4250 documents=0` | `4250 documents=0` |
| `invoice-unarchived` An unarchived document names no archive | PASS | `0` | `0` |
| `invoice-archived` An archived document names a target | PASS | `0` | `0` |
| `invoice-vendors` Every invoice vendor belongs to the profile | PASS | `0` | `0` |
| `invoice-archive-states` Every archive state carries the columns it promises | PASS | `0` | `0` |

## Verdict

PASS: 10 checks held against the seeded demo book.

## What this proves

- The migrations and the demo seed fill a real SQLite database with the demo book.
- Every money value read back is an integer of minor units with an ISO currency code.
- The money promises named by the checks hold for the demo data, each asserted against a stated expected value.

## What this does not prove

- No finance screen, capability, CLI command, or MCP tool exists on this branch, so this run drives the demo book at the data layer, not a user surface.
- A green run does not prove a new capability reads the same rows the same way; the pull request that adds the surface still needs its own proof.
