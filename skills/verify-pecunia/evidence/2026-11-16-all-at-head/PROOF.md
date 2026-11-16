# Verification proof: all

- Run label: `all-at-head`
- Run at: 2026-11-16T15:11:56Z
- Branch: `verify-skill` at `58626ce3`
- Node: `v24.18.0`
- Demo seed: `pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-PE0gDp/demo.sqlite`
- Demo book SHA-256: `527991d3898ec8fdce1029ee97f92a7c25f955c54e2375b38566f95f32537191`
- The scratch database is deleted after the run; `proof.json` holds every observation.

## Commands

```sh
pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-PE0gDp/demo.sqlite
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature all
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
| `bank-lines-stay-in-their-account` Every bank line belongs to its account's profile | PASS | `0` | `0` |
| `bank-lines-never-repeat` No bank line repeats inside one account | PASS | `0` | `0` |
| `demo-accounts` The demo book has a bank account and a broker account | PASS | `Demo Bank (bank),Demo Broker (investment)` | `Demo Bank (bank),Demo Broker (investment)` |
| `demo-sync-runs` The demo book has one sync that succeeded and one that failed | PASS | `2` | `2` |
| `sync-import-count-matches-lines` The succeeded sync wrote the number of lines it reports | PASS | `1` | `1` |
| `sync-failure-names-itself` The failed sync names its failure | PASS | `0` | `0` |
| `sync-rejections-match-count` The failed sync quarantines the number of lines it reports | PASS | `1` | `1` |
| `applied-rule-sets-category` An applied rule set the line's category | PASS | `0` | `0` |
| `classification-rule-sets-classification` A classification rule set the line's classification | PASS | `0` | `0` |
| `rule-targets-stay-in-profile` Rule targets stay inside their profile | PASS | `0` | `0` |
| `merchant-aliases-stay-in-profile` Merchant aliases stay inside their profile | PASS | `0` | `0` |
| `demo-rule-sweeps-its-line` The demo Cloud rule swept the demo Cloud line | PASS | `0192f0c1-0015-727a-8b92-b929ac9448a7 category-match=1 priority=10 enabled=1` | `0192f0c1-0015-727a-8b92-b929ac9448a7 category-match=1 priority=10 enabled=1` |
| `dashboard-spend` Posted spend over the demo business book | PASS | `328955` | `328955` |
| `dashboard-spend-lines` Posted spend comes from the five promised lines | PASS | `transaction-demo-02,transaction-demo-03,transaction-demo-04,transaction-demo-05,transaction-demo-11` | `transaction-demo-02,transaction-demo-03,transaction-demo-04,transaction-demo-05,transaction-demo-11` |
| `dashboard-income` Posted income is counted once | PASS | `480000` | `480000` |
| `dashboard-transfers` Internal and self transfers never count as spend | PASS | `160000` | `160000` |
| `dashboard-excluded` Excluded lines never count as spend | PASS | `1500` | `1500` |
| `dashboard-pending` A pending line is not posted spend | PASS | `transaction-demo-12` | `transaction-demo-12` |
| `dashboard-category` Posted Cloud total | PASS | `299000` | `299000` |
| `dashboard-parent-category` Software includes its Cloud child | PASS | `299000` | `299000` |
| `subscriptions-have-a-frequency-rule` Every counted subscription has a frequency rule | PASS | `0` | `0` |
| `subscriptions-active` The demo book has one active subscription | PASS | `1` | `1` |
| `subscriptions-annual-cost` The active subscription costs 358800 EUR minor units a year | PASS | `358800` | `358800` |
| `subscriptions-cancelled` The cancelled demo subscription stays out | PASS | `1` | `1` |
| `holdings-value-math` Holding values come from integer quantity and price | PASS | `Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000` | `Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000` |
| `holdings-stay-whole-cents` Every priced holding value lands on a whole minor unit | PASS | `0` | `0` |
| `holdings-pending-unknown` A pending holding carries no price | PASS | `1` | `1` |
| `holdings-known-value` Known portfolio value leaves the pending holding out | PASS | `788640000` | `788640000` |
| `holdings-platforms` Every holding's platform exists | PASS | `0` | `0` |
| `conversion-rounds-exactly` Base amounts round from source times rate | PASS | `0` | `0` |
| `conversion-keeps-same-currency` Same-currency lines keep their amount and carry no rate | PASS | `0` | `0` |
| `conversion-has-a-monthly-rate` Every foreign line has a monthly rate row | PASS | `0` | `0` |
| `conversion-recorded-lines` The demo book records both foreign lines | PASS | `transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17` | `transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17` |
| `tax-settles-once` A paid obligation is settled by a tax payment of the same amount | PASS | `0` | `0` |
| `tax-unpaid-has-no-settlement` An unpaid obligation carries no settlement | PASS | `0` | `0` |
| `tax-paid-total` Paid tax total | PASS | `250000` | `250000` |
| `tax-unpaid-total` Unpaid tax total | PASS | `312500` | `312500` |
| `tax-year` The demo tax year starts on 6 April | PASS | `GB 4-6` | `GB 4-6` |
| `invoice-matches-its-line` A linked invoice matches its transaction exactly | PASS | `0` | `0` |
| `invoice-exception-has-no-document` An exception names a transaction with no document | PASS | `4250 documents=0` | `4250 documents=0` |
| `invoice-unarchived` An unarchived document names no archive | PASS | `0` | `0` |
| `invoice-archived` An archived document names a target | PASS | `0` | `0` |
| `invoice-vendors` Every invoice vendor belongs to the profile | PASS | `0` | `0` |
| `invoice-archive-states` Every archive state carries the columns it promises | PASS | `0` | `0` |

## Verdict

PASS: 48 checks held against the seeded demo book.

## What this proves

- The migrations and the demo seed fill a real SQLite database with the demo book.
- Every money value read back is an integer of minor units with an ISO currency code.
- The money promises named by the checks hold for the demo data, each asserted against a stated expected value.

## What this does not prove

- No finance screen, capability, CLI command, or MCP tool exists on this branch, so this run drives the demo book at the data layer, not a user surface.
- A green run does not prove a new capability reads the same rows the same way; the pull request that adds the surface still needs its own proof.
