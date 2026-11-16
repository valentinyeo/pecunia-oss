# Verification proof: record-verdict

- Run label: `record-verdict`
- Run at: 2026-11-16T19:32:54Z
- Branch: `verify-skill` at `d6730e1c`
- Node: `v24.18.0`
- Demo seed: `pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-8bkHs0/demo.sqlite`
- Demo book SHA-256: `527991d3898ec8fdce1029ee97f92a7c25f955c54e2375b38566f95f32537191`
- The scratch database is deleted after the run; `proof.json` holds every observation.

## Commands

```sh
pnpm turbo run build --filter=@pecunia/bank-import...
pnpm turbo run build --filter=@pecunia/bank-lines...
pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-8bkHs0/demo.sqlite
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature all --label record-verdict
node skills/verify-pecunia/scripts/replay-proof.mjs --only record-verdict
```

## Steps

| Step | Exit | Commands | Checks |
| --- | --- | --- | --- |
| `seed` | 0 | `seed` 0 | 0 |
| `build` | 0 | `build-import` 0, `build-lines` 0 | 0 |
| `feature-map` | 0 | `map` 0 | 2 |
| `generic` | 0 |  | 4 |
| `accounts-and-bank-lines` | 0 | `bank-import` 0 | 12 |
| `bank-line-list` | 0 | `bank-line-list` 0 | 4 |
| `bank-line-edit` | 0 | `bank-line-edit` 0 | 4 |
| `bank-line-review` | 0 | `bank-line-review` 0 | 3 |
| `categories-and-rules` | 0 |  | 5 |
| `dashboard-sums` | 0 |  | 8 |
| `subscriptions` | 0 |  | 4 |
| `investments` | 0 |  | 5 |
| `fx-conversion` | 0 |  | 4 |
| `tax` | 0 |  | 5 |
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

## Checks

| Check | Result | Expected | Observed |
| --- | --- | --- | --- |
| `feature-map-matches-capabilities` Every capability is on a feature page or declared not money | passed | `0 unnamed, 0 unexported, 0 planned with a capability, 0 status mismatches` | `0 unnamed, 0 unexported, 0 planned with a capability, 0 status mismatches` |
| `feature-map-reports-no-problems` The map check counts every problem it prints and exits non-zero for each | passed | `problems=0 exit=0` | `problems=0 exit=0` |
| `money-is-integer-minor-units` Money is an integer of minor units | passed | `0 wrong declarations, 0 wrong rows, 11 columns` | `0 wrong declarations, 0 wrong rows, 11 columns` |
| `currency-is-an-iso-code` Every amount carries an ISO currency code | passed | `0 wrong currencies, 13 columns` | `0 wrong currencies, 13 columns` |
| `every-row-belongs-to-a-profile` Every row belongs to a profile and every reference resolves | passed | `ok, 0 foreign key violations, 0 tables with orphan rows, 17 scoped tables` | `ok, 0 foreign key violations, 0 tables with orphan rows, 17 scoped tables` |
| `demo-book-holds-made-up-identities` The demo book holds made-up identities only | passed | `0 non-placeholder emails, Demo Person,Example Ltd` | `0 non-placeholder emails, Demo Person,Example Ltd` |
| `bank-lines-stay-in-their-account` Every bank line belongs to its account's profile | passed | `0` | `0` |
| `bank-lines-never-repeat` No bank line repeats inside one account | passed | `0` | `0` |
| `demo-accounts` The demo book has a bank account and a broker account | passed | `Demo Bank (bank),Demo Broker (investment)` | `Demo Bank (bank),Demo Broker (investment)` |
| `demo-sync-runs` The demo book has one sync that succeeded and one that failed | passed | `2` | `2` |
| `sync-import-count-matches-lines` The succeeded sync wrote the number of lines it reports | passed | `1` | `1` |
| `sync-failure-names-itself` The failed sync names its failure | passed | `0` | `0` |
| `sync-rejections-match-count` The failed sync quarantines the number of lines it reports | passed | `1` | `1` |
| `import-targets-listed` The demo book lists its bank account as an import target | passed | `Demo Bank kind=bank base=EUR provider=Wise` | `Demo Bank kind=bank base=EUR provider=Wise` |
| `import-writes-every-line` An import writes every line in the demo file | passed | `imported=5 alreadyImported=0 rejected=0` | `imported=5 alreadyImported=0 rejected=0` |
| `import-replay-adds-nothing` A replay of the same file adds no rows | passed | `imported=0 alreadyImported=5` | `imported=0 alreadyImported=5` |
| `import-names-a-rejected-line` A broken line is rejected by name and kept out | passed | `imported=1 rejected=1 reason=bad-date` | `imported=1 rejected=1 reason=bad-date` |
| `import-refuses-unknown-account` An import refuses an account the profile does not hold | passed | `ImportAccountNotFound` | `ImportAccountNotFound` |
| `bank-line-list-returns-the-demo-book` The listing capability returns every demo line | passed | `12 lines from 12 demo lines, 2 awaiting review` | `12 lines from 12 demo lines, 2 awaiting review` |
| `bank-line-list-orders-newest-first` The listing capability orders lines newest first | passed | `newest first` | `newest first` |
| `bank-line-list-filters-by-direction` A direction filter returns only lines in that direction | passed | `out only, every filtered line is out, 8 lines` | `out only, every filtered line is out, 8 lines` |
| `bank-line-list-pages-without-repeats` Keyset paging never repeats a line | passed | `5 + 5 lines, 0 repeats` | `5 + 5 lines, 0 repeats` |
| `bank-line-edit-sets-category-and-note` The edit capability writes the category and the note | passed | `category set, note set` | `category set, note set` |
| `bank-line-edit-keeps-the-line-in-its-profile` The edit returns the same line in the same profile | passed | `true` | `true` |
| `bank-line-edit-refuses-an-unknown-line` An edit of a missing line is refused by name | passed | `UnknownBankLine` | `UnknownBankLine` |
| `bank-line-edit-refuses-a-foreign-category` An edit to a category outside the profile is refused by name | passed | `UnknownCategory` | `UnknownCategory` |
| `bank-line-review-marks-the-line` The review capability marks the line reviewed | passed | `Reviewed at a recorded time` | `Reviewed at a recorded time` |
| `bank-line-review-shows-in-the-list` The reviewed line reads back from the listing capability | passed | `Reviewed` | `Reviewed` |
| `bank-line-review-refuses-a-viewer` A read-only member cannot review a line | passed | `Forbidden` | `Forbidden` |
| `applied-rule-sets-category` An applied rule set the line's category | passed | `0` | `0` |
| `classification-rule-sets-classification` A classification rule set the line's classification | passed | `0` | `0` |
| `rule-targets-stay-in-profile` Rule targets stay inside their profile | passed | `0` | `0` |
| `merchant-aliases-stay-in-profile` Merchant aliases stay inside their profile | passed | `0` | `0` |
| `demo-rule-sweeps-its-line` The demo Cloud rule swept the demo Cloud line | passed | `0192f0c1-0015-727a-8b92-b929ac9448a7 category-match=1 priority=10 enabled=1` | `0192f0c1-0015-727a-8b92-b929ac9448a7 category-match=1 priority=10 enabled=1` |
| `dashboard-spend` Posted spend over the demo business book | passed | `328955` | `328955` |
| `dashboard-spend-lines` Posted spend comes from the five promised lines | passed | `transaction-demo-02,transaction-demo-03,transaction-demo-04,transaction-demo-05,transaction-demo-11` | `transaction-demo-02,transaction-demo-03,transaction-demo-04,transaction-demo-05,transaction-demo-11` |
| `dashboard-income` Posted income is counted once | passed | `480000` | `480000` |
| `dashboard-transfers` Internal and self transfers never count as spend | passed | `160000` | `160000` |
| `dashboard-excluded` Excluded lines never count as spend | passed | `1500` | `1500` |
| `dashboard-pending` A pending line is not posted spend | passed | `transaction-demo-12` | `transaction-demo-12` |
| `dashboard-category` Posted Cloud total | passed | `299000` | `299000` |
| `dashboard-parent-category` Software includes its Cloud child | passed | `299000` | `299000` |
| `subscriptions-have-a-frequency-rule` Every counted subscription has a frequency rule | passed | `0` | `0` |
| `subscriptions-active` The demo book has one active subscription | passed | `1` | `1` |
| `subscriptions-annual-cost` The active subscription costs 358800 EUR minor units a year | passed | `358800` | `358800` |
| `subscriptions-cancelled` The cancelled demo subscription stays out | passed | `1` | `1` |
| `holdings-value-math` Holding values come from integer quantity and price | passed | `Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000` | `Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000` |
| `holdings-stay-whole-cents` Every priced holding value lands on a whole minor unit | passed | `0` | `0` |
| `holdings-pending-unknown` A pending holding carries no price | passed | `1` | `1` |
| `holdings-known-value` Known portfolio value leaves the pending holding out | passed | `788640000` | `788640000` |
| `holdings-platforms` Every holding's platform exists | passed | `0` | `0` |
| `conversion-rounds-exactly` Base amounts round from source times rate | passed | `0` | `0` |
| `conversion-keeps-same-currency` Same-currency lines keep their amount and carry no rate | passed | `0` | `0` |
| `conversion-has-a-monthly-rate` Every foreign line has a monthly rate row | passed | `0` | `0` |
| `conversion-recorded-lines` The demo book records both foreign lines | passed | `transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17` | `transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17` |
| `tax-settles-once` A paid obligation is settled by a tax payment of the same amount | passed | `0` | `0` |
| `tax-unpaid-has-no-settlement` An unpaid obligation carries no settlement | passed | `0` | `0` |
| `tax-paid-total` Paid tax total | passed | `250000` | `250000` |
| `tax-unpaid-total` Unpaid tax total | passed | `312500` | `312500` |
| `tax-year` The demo tax year starts on 6 April | passed | `GB 4-6` | `GB 4-6` |
| `invoice-matches-its-line` A linked invoice matches its transaction exactly | passed | `0` | `0` |
| `invoice-exception-has-no-document` An exception names a transaction with no document | passed | `4250 documents=0` | `4250 documents=0` |
| `invoice-unarchived` An unarchived document names no archive | passed | `0` | `0` |
| `invoice-archived` An archived document names a target | passed | `0` | `0` |
| `invoice-vendors` Every invoice vendor belongs to the profile | passed | `0` | `0` |
| `invoice-archive-states` Every archive state carries the columns it promises | passed | `0` | `0` |

## Capability drives

- `bank-import-drive.json` from the `accounts-and-bank-lines` step
- `bank-line-list-drive.json` from the `bank-line-list` step
- `bank-line-edit-drive.json` from the `bank-line-edit` step
- `bank-line-review-drive.json` from the `bank-line-review` step

## Verdict

PASS: 15 steps ran, 66 checks held against the seeded demo book.

## What this proves

- The migrations and the demo seed fill a real SQLite database with the demo book.
- Every money value read back is an integer of minor units with an ISO currency code.
- Every check named above held for the demo data against its stated expected value.
- `bank-import-drive.json` from the `accounts-and-bank-lines` step ran.
- `bank-line-list-drive.json` from the `bank-line-list` step ran.
- `bank-line-edit-drive.json` from the `bank-line-edit` step ran.
- `bank-line-review-drive.json` from the `bank-line-review` step ran.

## What this does not prove

- The capability drives run on the package memory ledger and the demo seed; a persistent store and the RPC, MCP, and CLI projections are not exercised.
- No finance screen is reached, so the demo-book checks read the seeded data at the data layer.
