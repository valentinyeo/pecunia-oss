# Verification proof: capabilities

- Run label: `capabilities`
- Run at: 2026-11-26T09:42:40Z
- Branch: `capability-drives` at `34817f2e`
- Node: `v24.18.0`
- Demo seed: `pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-ETjd4R/demo.sqlite`
- Demo book SHA-256: `527991d3898ec8fdce1029ee97f92a7c25f955c54e2375b38566f95f32537191`
- The scratch database is deleted after the run; `proof.json` holds every observation.

## Commands

```sh
pnpm turbo run build --filter=@pecunia/bank-import...
pnpm turbo run build --filter=@pecunia/bank-lines...
pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-ETjd4R/demo.sqlite
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature all --label capabilities
node .claude/skills/verify-pecunia/scripts/replay-proof.mjs --only capabilities
```

## Steps

| Step                      | Exit | Commands                                                                                                                                                      | Expectations |
| ------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `seed`                    | 0    | `seed` 0                                                                                                                                                      | 0            |
| `build`                   | 0    | `build-import` 0, `build-lines` 0, `build-ai-tools` 0, `build-reporting` 0, `build-subscriptions` 0, `build-tax` 0, `build-investments` 0, `build-invoices` 0 | 0            |
| `feature-map`             | 0    | `map` 0                                                                                                                                                       | 1            |
| `parity`                  | 0    | `parity` 0                                                                                                                                                    | 1            |
| `generic`                 | 0    |                                                                                                                                                               | 4            |
| `accounts-and-bank-lines` | 0    | `bank-import` 0                                                                                                                                               | 16           |
| `bank-line-list`          | 0    | `bank-line-list` 0                                                                                                                                            | 4            |
| `bank-line-edit`          | 0    | `bank-line-edit` 0                                                                                                                                            | 7            |
| `bank-line-review`        | 0    | `bank-line-review` 0                                                                                                                                          | 4            |
| `categories-and-rules`    | 0    |                                                                                                                                                               | 5            |
| `dashboard-sums`          | 0    | `dashboard-sums-capabilities` 0                                                                                                                               | 18           |
| `subscriptions`           | 0    | `subscriptions-capabilities` 0                                                                                                                                | 12           |
| `investments`             | 0    | `investments-capabilities` 0                                                                                                                                  | 16           |
| `fx-conversion`           | 0    |                                                                                                                                                               | 4            |
| `tax`                     | 0    | `tax-capabilities` 0                                                                                                                                          | 12           |
| `invoices`                | 0    | `invoices-capabilities` 0                                                                                                                                     | 32           |
| `ai-tools`                | 0    | `ai-tools` 0                                                                                                                                                  | 17           |
| `web-server`              | 0    | `web-build` 0, `web-serve` 0                                                                                                                                  | 0            |
| `web-dashboard`           | 0    | `web-dashboard` 0                                                                                                                                             | 3            |
| `web-transactions`        | 0    | `web-transactions` 0                                                                                                                                          | 5            |
| `web-categories`          | 0    | `web-categories` 0                                                                                                                                            | 3            |
| `web-rules`               | 0    | `web-rules` 0                                                                                                                                                 | 3            |
| `web-aliases`             | 0    | `web-aliases` 0                                                                                                                                               | 3            |
| `web-merchants`           | 0    | `web-merchants` 0                                                                                                                                             | 3            |
| `web-review`              | 0    | `web-review` 0                                                                                                                                                | 2            |
| `web-search`              | 0    | `web-search` 0                                                                                                                                                | 2            |
| `web-budgets`             | 0    | `web-budgets` 0                                                                                                                                               | 1            |
| `web-subscriptions`       | 0    | `web-subscriptions` 0                                                                                                                                         | 6            |
| `web-investments`         | 0    | `web-investments` 0                                                                                                                                           | 3            |
| `web-settings`            | 0    | `web-settings` 0                                                                                                                                              | 2            |

Total: 189 expectations across 30 steps, 189 declared, 189 evaluated.

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
| `parity-matches-old-behaviours` | passed | `problems=0 exit=0` | `problems=0 exit=0` |
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
| `reporting-dashboard-totals` | passed | `spend=90945 income=205200 refund=2500 balance=422000 tax=120000` | `spend=90945 income=205200 refund=2500 balance=422000 tax=120000` |
| `reporting-category-totals` | passed | `spend=90945 Living:29945,Rent:45000,Software:12000,Transport:4000` | `spend=90945 Living:29945,Rent:45000,Software:12000,Transport:4000` |
| `reporting-spending-split` | passed | `business:12000:1319,mixed:0:0,personal:78945:8681,uncategorised:0:0` | `business:12000:1319,mixed:0:0,personal:78945:8681,uncategorised:0:0` |
| `reporting-parent-payments` | passed | `spend=29945 lines=Demo Market,Demo Ferry,Demo Market,Demo Market sum=29945` | `spend=29945 lines=Demo Market,Demo Ferry,Demo Market,Demo Market sum=29945` |
| `reporting-income-clients` | passed | `income=205200 refund=2500 Example Ltd:150000,Example Studio:55200` | `income=205200 refund=2500 Example Ltd:150000,Example Studio:55200` |
| `reporting-month-statement` | passed | `spend=90945 days=31 daily=90945 payments=11` | `spend=90945 days=31 daily=90945 payments=11` |
| `reporting-months-held` | passed | `2024-04,2024-03,2024-02` | `2024-04,2024-03,2024-02` |
| `reporting-spending-summary` | passed | `EUR 90945 Living:29945,Rent:45000,Software:12000,Transport:4000` | `EUR 90945 Living:29945,Rent:45000,Software:12000,Transport:4000` |
| `reporting-income-summary` | passed | `EUR income=205200 refund=2500 Example Ltd:150000,Example Studio:55200` | `EUR income=205200 refund=2500 Example Ltd:150000,Example Studio:55200` |
| `reporting-monthly-totals` | passed | `2024-03 in=207700 out=110945 net=96755` | `2024-03 in=207700 out=110945 net=96755` |
| `subscriptions-have-a-frequency-rule` | passed | `0` | `0` |
| `subscriptions-active` | passed | `1` | `1` |
| `subscriptions-annual-cost` | passed | `358800` | `358800` |
| `subscriptions-cancelled` | passed | `1` | `1` |
| `subscriptions-capability-lists-costs` | passed | `rows=2 monthly=29900 annual=358800 cancelled=1` | `rows=2 monthly=29900 annual=358800 cancelled=1` |
| `subscriptions-capability-detects-history` | passed | `Demo Cloud Hosting:monthly:29900:11,Demo Coffee:weekly:4250:6,Demo Design Tool:monthly:2765:3` | `Demo Cloud Hosting:monthly:29900:11,Demo Coffee:weekly:4250:6,Demo Design Tool:monthly:2765:3` |
| `subscriptions-capability-marks-existing` | passed | `sameId=true status=Confirmed annual=51000` | `sameId=true status=Confirmed annual=51000` |
| `subscriptions-mark-reads-back` | passed | `2 records` | `2 records` |
| `subscriptions-capability-cancels` | passed | `status=Cancelled next=null` | `status=Cancelled next=null` |
| `subscriptions-cancel-reads-back` | passed | `2 records` | `2 records` |
| `subscriptions-capability-sets-category` | passed | `0192f0c1-000d-75e9-8fd7-fd7e43c901ee` | `0192f0c1-000d-75e9-8fd7-fd7e43c901ee` |
| `subscriptions-category-reads-back` | passed | `2 records` | `2 records` |
| `holdings-value-math` | passed | `Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000` | `Demo Bitcoin value=8640000 gain=8040000; Demo World ETF value=780000000 gain=779550000` |
| `holdings-stay-whole-cents` | passed | `0` | `0` |
| `holdings-pending-unknown` | passed | `1` | `1` |
| `holdings-known-value` | passed | `788640000` | `788640000` |
| `holdings-platforms` | passed | `0` | `0` |
| `investments-capability-values-demo` | passed | `total=788640000 valued=2 unknown=1 Demo Bitcoin=8640000 gain=8040000,Demo Tech Stock=no-price,Demo World ETF=780000000 gain=779550000` | `total=788640000 valued=2 unknown=1 Demo Bitcoin=8640000 gain=8040000,Demo Tech Stock=no-price,Demo World ETF=780000000 gain=779550000` |
| `investments-capability-adds-holding` | passed | `symbol=DEMO-VERIFY quantity=2000000` | `symbol=DEMO-VERIFY quantity=2000000` |
| `investments-add-reads-back` | passed | `4 records` | `4 records` |
| `investments-capability-edits-holding` | passed | `Demo Renamed Stock quantity=3000000 price=200` | `Demo Renamed Stock quantity=3000000 price=200` |
| `investments-edit-reads-back` | passed | `4 records` | `4 records` |
| `investments-capability-deletes-holding` | passed | `DEMO-VERIFY` | `DEMO-VERIFY` |
| `investments-delete-reads-back` | passed | `3 records` | `3 records` |
| `investments-capability-syncs-broker` | passed | `created=3 updated=0 unpriced=1` | `created=3 updated=0 unpriced=1` |
| `investments-sync-reads-back` | passed | `6 records` | `6 records` |
| `investments-capability-refreshes-prices` | passed | `priced=4 unpriced=2` | `priced=4 unpriced=2` |
| `investments-refresh-reads-back` | passed | `6 records` | `6 records` |
| `conversion-rounds-exactly` | passed | `0` | `0` |
| `conversion-keeps-same-currency` | passed | `0` | `0` |
| `conversion-has-a-monthly-rate` | passed | `0` | `0` |
| `conversion-recorded-lines` | passed | `transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17` | `transaction-demo-03 2999 USD -> 2765 EUR at 0.922; transaction-demo-05 12000 GBP -> 14040 EUR at 1.17` |
| `tax-settles-once` | passed | `0` | `0` |
| `tax-unpaid-has-no-settlement` | passed | `0` | `0` |
| `tax-paid-total` | passed | `250000` | `250000` |
| `tax-unpaid-total` | passed | `312500` | `312500` |
| `tax-year` | passed | `GB 4-6` | `GB 4-6` |
| `tax-capability-lists-dues` | passed | `year=GB 4-6 vat:2025-11-07:EUR:312500:Estimated` | `year=GB 4-6 vat:2025-11-07:EUR:312500:Estimated` |
| `tax-capability-syncs-recorded-books` | passed | `inserted=2 removed=0 unchanged=0 updated=0` | `inserted=2 removed=0 unchanged=0 updated=0` |
| `tax-sync-reads-back` | passed | `3 records` | `3 records` |
| `tax-sync-removes-missing-payment` | passed | `inserted=0 removed=1 unchanged=1 updated=0` | `inserted=0 removed=1 unchanged=1 updated=0` |
| `tax-removal-reads-back` | passed | `2 records` | `2 records` |
| `tax-sync-replay-is-unchanged` | passed | `inserted=0 removed=0 unchanged=1 updated=0` | `inserted=0 removed=0 unchanged=1 updated=0` |
| `tax-replay-reads-back` | passed | `2 records` | `2 records` |
| `invoice-matches-its-line` | passed | `0` | `0` |
| `invoice-exception-has-no-document` | passed | `4250 documents=0` | `4250 documents=0` |
| `invoice-unarchived` | passed | `0` | `0` |
| `invoice-archived` | passed | `0` | `0` |
| `invoice-vendors` | passed | `0` | `0` |
| `invoice-archive-states` | passed | `0` | `0` |
| `invoices-capability-lists-status` | passed | `missing=1 Demo Coffee:Excepted,Demo Design Tool:Missing,Demo Cloud Hosting:Archived` | `missing=1 Demo Coffee:Excepted,Demo Design Tool:Missing,Demo Cloud Hosting:Archived` |
| `invoices-capability-counts-coverage` | passed | `2025-04:1:0:1:0,2025-03:1:0:0:1,2025-02:1:1:0:0` | `2025-04:1:0:1:0,2025-03:1:0:0:1,2025-02:1:1:0:0` |
| `invoices-capability-reads-places` | passed | `local:demo-archive:*.tmp` | `local:demo-archive:*.tmp` |
| `invoices-capability-reads-sources` | passed | `Demo Design Tool:https://portal.example.com` | `Demo Design Tool:https://portal.example.com` |
| `invoices-capability-proposes-match` | passed | `proposals=1 document=true payment=true stillUnattached=true` | `proposals=1 document=true payment=true stillUnattached=true` |
| `invoices-capability-saves-place` | passed | `sameId=true root=demo-verify-archive` | `sameId=true root=demo-verify-archive` |
| `invoices-place-reads-back` | passed | `1 records` | `1 records` |
| `invoices-capability-attaches-document` | passed | `payment=true amount=EUR:2765` | `payment=true amount=EUR:2765` |
| `invoices-attach-reads-back` | passed | `1 records` | `1 records` |
| `invoices-capability-reserves-archive` | passed | `Reserved` | `Reserved` |
| `invoices-reserve-reads-back` | passed | `1 records` | `1 records` |
| `invoices-capability-records-archive` | passed | `Archived` | `Archived` |
| `invoices-archive-reads-back` | passed | `1 records` | `1 records` |
| `invoices-capability-pages-archive` | passed | `total=2 first=demo-design-tool-2025-03.pdf second=demo-cloud-hosting-2025-02.pdf end=true` | `total=2 first=demo-design-tool-2025-03.pdf second=demo-cloud-hosting-2025-02.pdf end=true` |
| `invoices-capability-records-exception` | passed | `Demo receipt requested.` | `Demo receipt requested.` |
| `invoices-exception-reads-back` | passed | `3 records` | `3 records` |
| `invoices-capability-saves-source` | passed | `sameId=true pattern=demo design tool` | `sameId=true pattern=demo design tool` |
| `invoices-source-reads-back` | passed | `1 records` | `1 records` |
| `invoices-capability-saves-file-once` | passed | `sameId=true payment=true` | `sameId=true payment=true` |
| `invoices-file-reads-back` | passed | `1 records` | `1 records` |
| `invoices-capability-registers-legacy-once` | passed | `first=Existing,Stored replay=Existing,Existing` | `first=Existing,Stored replay=Existing,Existing` |
| `invoices-legacy-reads-back` | passed | `1 records` | `1 records` |
| `invoices-capability-deletes-source` | passed | `sameId=true` | `sameId=true` |
| `invoices-source-delete-reads-back` | passed | `1 records` | `1 records` |
| `invoices-capability-removes-document` | passed | `sameId=true` | `sameId=true` |
| `invoices-remove-reads-back` | passed | `3 records` | `3 records` |
| `ai-tools-catalog` | passed | `list_categories:read,list_lines:read,get_line:read,suggest_category:write,confirm_category:write,list_reports:read` | `list_categories:read,list_lines:read,get_line:read,suggest_category:write,confirm_category:write,list_reports:read` |
| `ai-tools-lists-categories` | passed | `categories=2 names=Groceries,Travel` | `categories=2 names=Groceries,Travel` |
| `ai-tools-lists-lines` | passed | `lines=2 total=2 next=none` | `lines=2 total=2 next=none` |
| `ai-tools-reads-one-line` | passed | `line=0192f0c1-6005-7a2b-8c4d-5e6f70819322 category=none review=Awaiting` | `line=0192f0c1-6005-7a2b-8c4d-5e6f70819322 category=none review=Awaiting` |
| `ai-tools-suggests-without-confirming` | passed | `suggested=0192f0c1-6002-7a2b-8c4d-5e6f70819311 lineCategory=none` | `suggested=0192f0c1-6002-7a2b-8c4d-5e6f70819311 lineCategory=none` |
| `ai-tools-confirms-a-category` | passed | `line=0192f0c1-6005-7a2b-8c4d-5e6f70819322 category=0192f0c1-6002-7a2b-8c4d-5e6f70819311` | `line=0192f0c1-6005-7a2b-8c4d-5e6f70819322 category=0192f0c1-6002-7a2b-8c4d-5e6f70819311` |
| `ai-tools-confirmed-line-reads-back` | passed | `2 records` | `2 records` |
| `ai-tools-lists-reports` | passed | `reports=2 kinds=exploration,report` | `reports=2 kinds=exploration,report` |
| `ai-tools-viewer-lists-categories` | passed | `categories=2 names=Groceries,Travel` | `categories=2 names=Groceries,Travel` |
| `ai-tools-viewer-lists-lines` | passed | `lines=2 total=2 next=none` | `lines=2 total=2 next=none` |
| `ai-tools-viewer-reads-one-line` | passed | `line=0192f0c1-6005-7a2b-8c4d-5e6f70819322 category=0192f0c1-6002-7a2b-8c4d-5e6f70819311 review=Awaiting` | `line=0192f0c1-6005-7a2b-8c4d-5e6f70819322 category=0192f0c1-6002-7a2b-8c4d-5e6f70819311 review=Awaiting` |
| `ai-tools-viewer-lists-reports` | passed | `reports=2 kinds=exploration,report` | `reports=2 kinds=exploration,report` |
| `ai-tools-refuses-a-viewer-confirm` | passed | `reason=notPermitted field=none` | `reason=notPermitted field=none` |
| `ai-tools-viewer-confirm-changes-nothing` | passed | `line=0192f0c1-6005-7a2b-8c4d-5e6f70819322 category=0192f0c1-6002-7a2b-8c4d-5e6f70819311` | `line=0192f0c1-6005-7a2b-8c4d-5e6f70819322 category=0192f0c1-6002-7a2b-8c4d-5e6f70819311` |
| `ai-tools-refuses-a-viewer-write` | passed | `reason=notPermitted field=none` | `reason=notPermitted field=none` |
| `ai-tools-viewer-suggest-stores-nothing` | passed | `suggestions=1 lines=0192f0c1-6005-7a2b-8c4d-5e6f70819322` | `suggestions=1 lines=0192f0c1-6005-7a2b-8c4d-5e6f70819322` |
| `ai-tools-refuses-an-unknown-tool` | passed | `reason=unknownTool field=none` | `reason=unknownTool field=none` |
| `web-dashboard-net-worth` | passed | `£48,250.00` | `£48,250.00` |
| `web-dashboard-net-worth-matches-accounts` | passed | `true` | `true` |
| `web-dashboard-spend-by-category` | passed | `Rent,Groceries,Transport,Eating out,Utilities,Everything else` | `Rent,Groceries,Transport,Eating out,Utilities,Everything else` |
| `web-transactions-lists-every-demo-line` | passed | `12` | `12` |
| `web-transactions-search-narrows-the-list` | passed | `Demo Coffee; 2` | `Demo Coffee; 2` |
| `web-transactions-category-link-filters-the-list` | passed | `2` | `2` |
| `web-transactions-category-link-is-its-own-url` | passed | `true` | `true` |
| `web-transactions-edit-form-opens` | passed | `Category,Note` | `Category,Note` |
| `web-categories-spend-table` | passed | `Spend in Mar 2026; Everything else; £2,500.00; £2,500.00; 82.4%` | `Spend in Mar 2026; Everything else; £2,500.00; £2,500.00; 82.4%` |
| `web-categories-month-picker` | passed | `Spend in Jan 2026; Everything else; £2,500.00; £2,500.00; 82.4%` | `Spend in Jan 2026; Everything else; £2,500.00; £2,500.00; 82.4%` |
| `web-categories-management-lists-every-category` | passed | `9` | `9` |
| `web-rules-lists-every-rule` | passed | `6` | `6` |
| `web-rules-shows-the-pattern` | passed | `Demo Grocer; contains "Demo Grocer"; Groceries` | `Demo Grocer; contains "Demo Grocer"; Groceries` |
| `web-rules-new-rule-form-opens` | passed | `Least amount` | `Least amount` |
| `web-aliases-lists-every-alias` | passed | `4` | `4` |
| `web-aliases-shows-the-match-kind` | passed | `prefix` | `prefix` |
| `web-aliases-new-alias-form-opens` | passed | `Text on the statement` | `Text on the statement` |
| `web-merchants-lists-every-merchant` | passed | `8 of 8 merchants` | `8 of 8 merchants` |
| `web-merchants-filter-narrows-the-list` | passed | `2 of 8 merchants` | `2 of 8 merchants` |
| `web-merchants-shows-count-and-total` | passed | `Demo Grocer; 12; £1,036.80` | `Demo Grocer; 12; £1,036.80` |
| `web-review-lists-uncategorised-lines` | passed | `5` | `5` |
| `web-review-suggests-categories` | passed | `2 suggestions are ready.` | `2 suggestions are ready.` |
| `web-search-suggests-while-typing` | passed | `5` | `5` |
| `web-search-finds-payments-and-holdings` | passed | `Holdings,Payments; 11` | `Holdings,Payments; 11` |
| `web-budgets-is-a-later-slice` | passed | `This screen lands in a later slice. The demo book has no data for it yet.` | `This screen lands in a later slice. The demo book has no data for it yet.` |
| `web-subscriptions-lists-repeat-payments` | passed | `Demo Cloud Hosting,Demo Coffee` | `Demo Cloud Hosting,Demo Coffee` |
| `web-subscriptions-shows-frequency` | passed | `Monthly · €3,588.00 a year,Weekly · €2,210.00 a year` | `Monthly · €3,588.00 a year,Weekly · €2,210.00 a year` |
| `web-subscriptions-shows-confidence` | passed | `96% confidence,61% confidence` | `96% confidence,61% confidence` |
| `web-subscriptions-shows-the-annual-total` | passed | `€299.00; €3,588.00` | `€299.00; €3,588.00` |
| `web-subscriptions-filters-to-active` | passed | `active=1 all=2 confirmed=1` | `active=1 all=2 confirmed=1` |
| `web-subscriptions-cancels-a-repeat-payment` | passed | `annual=€0.00` | `annual=€0.00` |
| `web-investments-groups-holdings-by-platform` | passed | `Generic Broker,Generic Crypto Exchange` | `Generic Broker,Generic Crypto Exchange` |
| `web-investments-shows-a-priceless-holding` | passed | `1` | `1` |
| `web-investments-shows-value-and-gain` | passed | `€86,400.00 Gain €80,400.00` | `€86,400.00 Gain €80,400.00` |
| `web-settings-shows-the-demo-values` | passed | `GBP; en-GB; Europe/London` | `GBP; en-GB; Europe/London` |
| `web-settings-lists-the-profiles` | passed | `Example Ltd,Demo Person` | `Example Ltd,Demo Person` |

## Capability drives

- `bank-import-drive.json` from the `accounts-and-bank-lines` step
- `bank-line-list-drive.json` from the `bank-line-list` step
- `bank-line-edit-drive.json` from the `bank-line-edit` step
- `bank-line-review-drive.json` from the `bank-line-review` step
- `dashboard-sums-drive.json` from the `dashboard-sums` step
- `subscriptions-drive.json` from the `subscriptions` step
- `investments-drive.json` from the `investments` step
- `tax-drive.json` from the `tax` step
- `invoices-drive.json` from the `invoices` step
- `ai-tools-drive.json` from the `ai-tools` step
- `web-dashboard.png` from the `web-dashboard` step
- `web-transactions.png` from the `web-transactions` step
- `web-categories.png` from the `web-categories` step
- `web-rules.png` from the `web-rules` step
- `web-aliases.png` from the `web-aliases` step
- `web-merchants.png` from the `web-merchants` step
- `web-review.png` from the `web-review` step
- `web-search.png` from the `web-search` step
- `web-budgets.png` from the `web-budgets` step
- `web-subscriptions.png` from the `web-subscriptions` step
- `web-investments.png` from the `web-investments` step
- `web-settings.png` from the `web-settings` step

## Verdict

PASS: 30 steps ran, 189 expectations held against the seeded demo book.

## What this proves

- The migrations and the demo seed fill a real SQLite database with the demo book.
- Every money value read back is an integer of minor units with an ISO currency code.
- Every expectation named above matched its observation for the demo data.
- `bank-import-drive.json` from the `accounts-and-bank-lines` step ran.
- `bank-line-list-drive.json` from the `bank-line-list` step ran.
- `bank-line-edit-drive.json` from the `bank-line-edit` step ran.
- `bank-line-review-drive.json` from the `bank-line-review` step ran.
- `dashboard-sums-drive.json` from the `dashboard-sums` step ran.
- `subscriptions-drive.json` from the `subscriptions` step ran.
- `investments-drive.json` from the `investments` step ran.
- `tax-drive.json` from the `tax` step ran.
- `invoices-drive.json` from the `invoices` step ran.
- `ai-tools-drive.json` from the `ai-tools` step ran.
- `web-dashboard.png` from the `web-dashboard` step ran.
- `web-transactions.png` from the `web-transactions` step ran.
- `web-categories.png` from the `web-categories` step ran.
- `web-rules.png` from the `web-rules` step ran.
- `web-aliases.png` from the `web-aliases` step ran.
- `web-merchants.png` from the `web-merchants` step ran.
- `web-review.png` from the `web-review` step ran.
- `web-search.png` from the `web-search` step ran.
- `web-budgets.png` from the `web-budgets` step ran.
- `web-subscriptions.png` from the `web-subscriptions` step ran.
- `web-investments.png` from the `web-investments` step ran.
- `web-settings.png` from the `web-settings` step ran.

## What this does not prove

- The capability drives run on the package memory ledger and the demo seed; a persistent store and the RPC, MCP, and CLI projections are not exercised.
- A screen step drives a client fixture in a browser. The figure it reads is not evidence for the capability that will feed that screen.
