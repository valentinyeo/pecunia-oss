# Verification proof: invoices-per-feature

- Run label: `invoices-per-feature`
- Run at: 2026-11-16T20:04:33Z
- Branch: `verify-skill` at `81f3d793`
- Node: `v24.18.0`
- Demo seed: `pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-4KeoKV/demo.sqlite`
- Demo book SHA-256: `527991d3898ec8fdce1029ee97f92a7c25f955c54e2375b38566f95f32537191`
- The scratch database is deleted after the run; `proof.json` holds every observation.

## Commands

```sh
pnpm turbo run build --filter=@pecunia/bank-import...
pnpm turbo run build --filter=@pecunia/bank-lines...
pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-4KeoKV/demo.sqlite
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature invoices --label invoices-per-feature
node skills/verify-pecunia/scripts/replay-proof.mjs --only invoices-per-feature
```

## Steps

| Step | Exit | Commands | Expectations |
| --- | --- | --- | --- |
| `seed` | 0 | `seed` 0 | 0 |
| `feature-map` | 0 | `map` 0 | 1 |
| `generic` | 0 |  | 4 |
| `invoices` | 0 |  | 6 |

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

## Expectations

| Expectation | Result | Expected | Observed |
| --- | --- | --- | --- |
| `feature-map-matches-capabilities` | passed | `unnamed=0 unexported=0 planned=0 status=0 problems=0 exit=0` | `unnamed=0 unexported=0 planned=0 status=0 problems=0 exit=0` |
| `money-is-integer-minor-units` | passed | `wrongDeclarations=0 wrongRows=0 columns=11` | `wrongDeclarations=0 wrongRows=0 columns=11` |
| `currency-is-an-iso-code` | passed | `wrongCurrencies=0 columns=13` | `wrongCurrencies=0 columns=13` |
| `every-row-belongs-to-a-profile` | passed | `integrity=ok foreignKeyViolations=0 tablesWithOrphans=0 scopedTables=17` | `integrity=ok foreignKeyViolations=0 tablesWithOrphans=0 scopedTables=17` |
| `demo-book-holds-made-up-identities` | passed | `nonPlaceholderEmails=0 profiles=Demo Person,Example Ltd` | `nonPlaceholderEmails=0 profiles=Demo Person,Example Ltd` |
| `invoice-matches-its-line` | passed | `0` | `0` |
| `invoice-exception-has-no-document` | passed | `4250 documents=0` | `4250 documents=0` |
| `invoice-unarchived` | passed | `0` | `0` |
| `invoice-archived` | passed | `0` | `0` |
| `invoice-vendors` | passed | `0` | `0` |
| `invoice-archive-states` | passed | `0` | `0` |

## Verdict

PASS: 4 steps ran, 11 expectations held against the seeded demo book.

## What this proves

- The migrations and the demo seed fill a real SQLite database with the demo book.
- Every money value read back is an integer of minor units with an ISO currency code.
- Every expectation named above matched its observation for the demo data.

## What this does not prove

- The capability drives run on the package memory ledger and the demo seed; a persistent store and the RPC, MCP, and CLI projections are not exercised.
- No finance screen is reached, so the demo-book expectations read the seeded data at the data layer.
