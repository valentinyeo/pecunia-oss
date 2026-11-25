# Verification proof: all

- Run label: `all`
- Run at: 2026-11-16T22:13:11Z
- Branch: `verify-skill` at `2c85018a`
- Node: `v24.18.0`
- Demo seed: `pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-x7ARGM/demo.sqlite`
- Demo book SHA-256: `527991d3898ec8fdce1029ee97f92a7c25f955c54e2375b38566f95f32537191`
- The scratch database is deleted after the run; `proof.json` holds every observation.

## Commands

```sh
pnpm turbo run build --filter=@pecunia/bank-import...
pnpm turbo run build --filter=@pecunia/bank-lines...
pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-x7ARGM/demo.sqlite
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature all --label all
node .claude/skills/verify-pecunia/scripts/replay-proof.mjs --only all
```

## Steps

| Step | Exit | Commands | Expectations |
| --- | --- | --- | --- |
| `seed` | 0 | `seed` 0 | 0 |
| `build` | 0 | `build-import` 0, `build-lines` 0 | 0 |
| `feature-map` | 0 | `map` 0 | 1 |
| `generic` | 0 |  | 4 |
| `accounts-and-bank-lines` | 0 | `bank-import` 0 | 16 |
| `bank-line-list` | 0 | `bank-line-list` 0 | 4 |
| `bank-line-edit` | 0 | `bank-line-edit` 0 | 7 |
| `bank-line-review` | 0 | `bank-line-review` 0 | 4 |
| `categories-and-rules` | 0 |  | 5 |
| `dashboard-sums` | 0 |  | 8 |
| `subscriptions` | 0 |  | 4 |
| `investments` | 0 |  | 5 |
| `fx-conversion` | 0 |  | 4 |
| `tax` | 0 |  | 5 |
| `invoices` | 0 |  | 6 |

Total: 73 expectations across 15 steps, 73 declared, 73 evaluated.

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
| `bank-lines-stay-in-their-account` | passed | `0` | `0` |
| `bank-lines-never-repeat` | passed | `0` | `0` |
| `demo-accounts` | passed | `Demo Bank (bank),Demo Broker (investment)` | `Demo Bank (bank),Demo Broker (investment)` |
| `demo-sync-runs` | passed | `2` | `2` |
| `sync-import-count-matches-lines` | passed | `true` | `true` |
| `sync-failure-names-itself` | passed | `0` | `0` |
| `sync-rejections-match-count` | passed | `true` | `true` |
| `import-targets-listed` | passed | `label=Demo Bank kind=bank base=EUR provider=Wise` | `label=Demo Bank kind=bank base=EUR provider=Wise` |
| `import-writes-every-line` | passed | `imported=5 alreadyImported=0 rejected=0` | `imported=5 alreadyImported=0 rejected=0` |
| `import-stores-every-line` | passed | `5 records` | `5 records` |
| `import-replay-adds-nothing` | passed | `imported=0 alreadyImported=5` | `imported=0 alreadyImported=5` |
| `import-replay-stores-nothing` | passed | `5 records` | `5 records` |
| `import-names-a-rejected-line` | passed | `imported=1 rejected=1 reason=bad-date` | `imported=1 rejected=1 reason=bad-date` |
| `import-rejected-line-stores-once` | passed | `6 records` | `6 records` |
| `import-refuses-unknown-account` | passed | `ImportAccountNotFound` | `ImportAccountNotFound` |
| `import-unknown-account-stores-nothing` | passed | `6 records` | `6 records` |
| `bank-line-list-returns-the-demo-book` | passed | `total=12 demoLines=12 awaiting=2` | `total=12 demoLines=12 awaiting=2` |
| `bank-line-list-orders-newest-first` | passed | `true` | `true` |
| `bank-line-list-filters-by-direction` | passed | `lines=8 allOut=true bookOut=8` | `lines=8 allOut=true bookOut=8` |
| `bank-line-list-pages-without-repeats` | passed | `first=5 second=5 overlap=0` | `first=5 second=5 overlap=0` |
| `bank-line-edit-sets-category-and-note` | passed | `category=0192f0c1-000d-75e9-8fd7-fd7e43c901ee note=Demo note written by the verify drive` | `category=0192f0c1-000d-75e9-8fd7-fd7e43c901ee note=Demo note written by the verify drive` |
| `bank-line-edit-stores-category-and-note` | passed | `12 records` | `12 records` |
| `bank-line-edit-unknown-line-stores-nothing` | passed | `12 records` | `12 records` |
| `bank-line-edit-foreign-category-stores-nothing` | passed | `12 records` | `12 records` |
| `bank-line-edit-keeps-the-line-in-its-profile` | passed | `lineId=0192f0c1-0027-7c11-8261-2619d29e6868 profileId=0192f0c1-0001-702d-8484-48490b729601` | `lineId=0192f0c1-0027-7c11-8261-2619d29e6868 profileId=0192f0c1-0001-702d-8484-48490b729601` |
| `bank-line-edit-refuses-an-unknown-line` | passed | `UnknownBankLine` | `UnknownBankLine` |
| `bank-line-edit-refuses-a-foreign-category` | passed | `UnknownCategory` | `UnknownCategory` |
| `bank-line-review-marks-the-line` | passed | `tag=Reviewed hasTime=true` | `tag=Reviewed hasTime=true` |
| `bank-line-review-shows-in-the-list` | passed | `12 records` | `12 records` |
| `bank-line-review-viewer-stores-nothing` | passed | `12 records` | `12 records` |
| `bank-line-review-refuses-a-viewer` | passed | `Forbidden` | `Forbidden` |
| `applied-rule-sets-category` | passed | `0` | `0` |
| `classification-rule-sets-classification` | passed | `0` | `0` |
| `rule-targets-stay-in-profile` | passed | `0` | `0` |
| `merchant-aliases-stay-in-profile` | passed | `0` | `0` |
| `demo-rule-sweeps-its-line` | passed | `0192f0c1-0015-727a-8b92-b929ac9448a7 category-match=1 priority=10 enabled=1` | `0192f0c1-0015-727a-8b92-b929ac9448a7 category-match=1 priority=10 enabled=1` |
| `dashboard-spend` | passed | `328955` | `328955` |
| `dashboard-spend-lines` | passed | `transaction-demo-02,transaction-demo-03,transaction-demo-04,transaction-demo-05,transaction-demo-11` | `transaction-demo-02,transaction-demo-03,transaction-demo-04,transaction-demo-05,transaction-demo-11` |
| `dashboard-income` | passed | `480000` | `480000` |
| `dashboard-transfers` | passed | `160000` | `160000` |
| `dashboard-excluded` | passed | `1500` | `1500` |
| `dashboard-pending` | passed | `transaction-demo-12` | `transaction-demo-12` |
| `dashboard-category` | passed | `299000` | `299000` |
| `dashboard-parent-category` | passed | `299000` | `299000` |
| `subscriptions-have-a-frequency-rule` | passed | `0` | `0` |
| `subscriptions-active` | passed | `1` | `1` |
| `subscriptions-annual-cost` | passed | `358800` | `358800` |
| `subscriptions-cancelled` | passed | `1` | `1` |
| `holdings-value-math` | passed | `Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000` | `Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000` |
| `holdings-stay-whole-cents` | passed | `0` | `0` |
| `holdings-pending-unknown` | passed | `1` | `1` |
| `holdings-known-value` | passed | `788640000` | `788640000` |
| `holdings-platforms` | passed | `0` | `0` |
| `conversion-rounds-exactly` | passed | `0` | `0` |
| `conversion-keeps-same-currency` | passed | `0` | `0` |
| `conversion-has-a-monthly-rate` | passed | `0` | `0` |
| `conversion-recorded-lines` | passed | `transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17` | `transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17` |
| `tax-settles-once` | passed | `0` | `0` |
| `tax-unpaid-has-no-settlement` | passed | `0` | `0` |
| `tax-paid-total` | passed | `250000` | `250000` |
| `tax-unpaid-total` | passed | `312500` | `312500` |
| `tax-year` | passed | `GB 4-6` | `GB 4-6` |
| `invoice-matches-its-line` | passed | `0` | `0` |
| `invoice-exception-has-no-document` | passed | `4250 documents=0` | `4250 documents=0` |
| `invoice-unarchived` | passed | `0` | `0` |
| `invoice-archived` | passed | `0` | `0` |
| `invoice-vendors` | passed | `0` | `0` |
| `invoice-archive-states` | passed | `0` | `0` |

## Capability drives

- `bank-import-drive.json` from the `accounts-and-bank-lines` step
- `bank-line-list-drive.json` from the `bank-line-list` step
- `bank-line-edit-drive.json` from the `bank-line-edit` step
- `bank-line-review-drive.json` from the `bank-line-review` step

## Verdict

PASS: 15 steps ran, 73 expectations held against the seeded demo book.

## What this proves

- The migrations and the demo seed fill a real SQLite database with the demo book.
- Every money value read back is an integer of minor units with an ISO currency code.
- Every expectation named above matched its observation for the demo data.
- `bank-import-drive.json` from the `accounts-and-bank-lines` step ran.
- `bank-line-list-drive.json` from the `bank-line-list` step ran.
- `bank-line-edit-drive.json` from the `bank-line-edit` step ran.
- `bank-line-review-drive.json` from the `bank-line-review` step ran.

## What this does not prove

- The capability drives run on the package memory ledger and the demo seed; a persistent store and the RPC, MCP, and CLI projections are not exercised.
- No finance screen is reached, so the demo-book expectations read the seeded data at the data layer.
