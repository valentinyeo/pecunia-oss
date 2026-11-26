# Verification proof: web

- Run label: `web`
- Run at: 2026-11-26T00:29:19Z
- Branch: `verify-drive` at `38313e3e`
- Node: `v24.18.0`
- Demo seed: `pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-MRMYl2/demo.sqlite`
- Demo book SHA-256: `527991d3898ec8fdce1029ee97f92a7c25f955c54e2375b38566f95f32537191`
- The scratch database is deleted after the run; `proof.json` holds every observation.

## Commands

```sh
pnpm turbo run build --filter=@pecunia/bank-import...
pnpm turbo run build --filter=@pecunia/bank-lines...
pnpm --filter @pecunia/database db:seed:demo /tmp/pecunia-verify-MRMYl2/demo.sqlite
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature web-screens --label web
node .claude/skills/verify-pecunia/scripts/replay-proof.mjs --only web
```

## Steps

| Step                | Exit | Commands                     | Expectations |
| ------------------- | ---- | ---------------------------- | ------------ |
| `seed`              | 0    | `seed` 0                     | 0            |
| `feature-map`       | 0    | `map` 0                      | 1            |
| `parity`            | 0    | `parity` 0                   | 1            |
| `generic`           | 0    |                              | 4            |
| `web-server`        | 0    | `web-build` 0, `web-serve` 0 | 0            |
| `web-dashboard`     | 0    | `web-dashboard` 0            | 3            |
| `web-transactions`  | 0    | `web-transactions` 0         | 5            |
| `web-categories`    | 0    | `web-categories` 0           | 3            |
| `web-rules`         | 0    | `web-rules` 0                | 3            |
| `web-aliases`       | 0    | `web-aliases` 0              | 3            |
| `web-merchants`     | 0    | `web-merchants` 0            | 3            |
| `web-review`        | 0    | `web-review` 0               | 2            |
| `web-search`        | 0    | `web-search` 0               | 2            |
| `web-budgets`       | 0    | `web-budgets` 0              | 1            |
| `web-subscriptions` | 0    | `web-subscriptions` 0        | 1            |
| `web-investments`   | 0    | `web-investments` 0          | 3            |
| `web-settings`      | 0    | `web-settings` 0             | 2            |

Total: 37 expectations across 17 steps, 37 declared, 37 evaluated.

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

| Expectation                                       | Result | Expected                                                                    | Observed                                                                    |
| ------------------------------------------------- | ------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `feature-map-matches-capabilities`                | passed | `unnamed=0 unexported=0 planned=0 status=0 problems=0 exit=0`               | `unnamed=0 unexported=0 planned=0 status=0 problems=0 exit=0`               |
| `parity-matches-old-behaviours`                   | passed | `problems=0 exit=0`                                                         | `problems=0 exit=0`                                                         |
| `money-is-integer-minor-units`                    | passed | `wrongDeclarations=0 wrongRows=0 columns=11`                                | `wrongDeclarations=0 wrongRows=0 columns=11`                                |
| `currency-is-an-iso-code`                         | passed | `wrongCurrencies=0 columns=13`                                              | `wrongCurrencies=0 columns=13`                                              |
| `every-row-belongs-to-a-profile`                  | passed | `integrity=ok foreignKeyViolations=0 tablesWithOrphans=0 scopedTables=17`   | `integrity=ok foreignKeyViolations=0 tablesWithOrphans=0 scopedTables=17`   |
| `demo-book-holds-made-up-identities`              | passed | `nonPlaceholderEmails=0 profiles=Demo Person,Example Ltd`                   | `nonPlaceholderEmails=0 profiles=Demo Person,Example Ltd`                   |
| `web-dashboard-net-worth`                         | passed | `£48,250.00`                                                                | `£48,250.00`                                                                |
| `web-dashboard-net-worth-matches-accounts`        | passed | `true`                                                                      | `true`                                                                      |
| `web-dashboard-spend-by-category`                 | passed | `Rent,Groceries,Transport,Eating out,Utilities,Everything else`             | `Rent,Groceries,Transport,Eating out,Utilities,Everything else`             |
| `web-transactions-lists-every-demo-line`          | passed | `12`                                                                        | `12`                                                                        |
| `web-transactions-search-narrows-the-list`        | passed | `Demo Coffee; 2`                                                            | `Demo Coffee; 2`                                                            |
| `web-transactions-category-link-filters-the-list` | passed | `2`                                                                         | `2`                                                                         |
| `web-transactions-category-link-is-its-own-url`   | passed | `true`                                                                      | `true`                                                                      |
| `web-transactions-edit-form-opens`                | passed | `Category,Note`                                                             | `Category,Note`                                                             |
| `web-categories-spend-table`                      | passed | `Spend in Mar 2026; Everything else; £2,500.00; £2,500.00; 82.4%`           | `Spend in Mar 2026; Everything else; £2,500.00; £2,500.00; 82.4%`           |
| `web-categories-month-picker`                     | passed | `Spend in Jan 2026; Everything else; £2,500.00; £2,500.00; 82.4%`           | `Spend in Jan 2026; Everything else; £2,500.00; £2,500.00; 82.4%`           |
| `web-categories-management-lists-every-category`  | passed | `9`                                                                         | `9`                                                                         |
| `web-rules-lists-every-rule`                      | passed | `6`                                                                         | `6`                                                                         |
| `web-rules-shows-the-pattern`                     | passed | `Demo Grocer; contains "Demo Grocer"; Groceries`                            | `Demo Grocer; contains "Demo Grocer"; Groceries`                            |
| `web-rules-new-rule-form-opens`                   | passed | `Least amount`                                                              | `Least amount`                                                              |
| `web-aliases-lists-every-alias`                   | passed | `4`                                                                         | `4`                                                                         |
| `web-aliases-shows-the-match-kind`                | passed | `prefix`                                                                    | `prefix`                                                                    |
| `web-aliases-new-alias-form-opens`                | passed | `Text on the statement`                                                     | `Text on the statement`                                                     |
| `web-merchants-lists-every-merchant`              | passed | `8 of 8 merchants`                                                          | `8 of 8 merchants`                                                          |
| `web-merchants-filter-narrows-the-list`           | passed | `2 of 8 merchants`                                                          | `2 of 8 merchants`                                                          |
| `web-merchants-shows-count-and-total`             | passed | `Demo Grocer; 12; £1,036.80`                                                | `Demo Grocer; 12; £1,036.80`                                                |
| `web-review-lists-uncategorised-lines`            | passed | `5`                                                                         | `5`                                                                         |
| `web-review-suggests-categories`                  | passed | `2 suggestions are ready.`                                                  | `2 suggestions are ready.`                                                  |
| `web-search-suggests-while-typing`                | passed | `5`                                                                         | `5`                                                                         |
| `web-search-finds-payments-and-holdings`          | passed | `Holdings,Payments; 11`                                                     | `Holdings,Payments; 11`                                                     |
| `web-budgets-is-a-later-slice`                    | passed | `This screen lands in a later slice. The demo book has no data for it yet.` | `This screen lands in a later slice. The demo book has no data for it yet.` |
| `web-subscriptions-fails-to-load`                 | passed | `Service not found: @pecunia/web/SubscriptionsGateway`                      | `Service not found: @pecunia/web/SubscriptionsGateway`                      |
| `web-investments-groups-holdings-by-platform`     | passed | `Generic Broker,Generic Crypto Exchange`                                    | `Generic Broker,Generic Crypto Exchange`                                    |
| `web-investments-shows-a-priceless-holding`       | passed | `1`                                                                         | `1`                                                                         |
| `web-investments-shows-value-and-gain`            | passed | `€86,400.00 Gain €80,400.00`                                                | `€86,400.00 Gain €80,400.00`                                                |
| `web-settings-shows-the-demo-values`              | passed | `GBP; en-GB; Europe/London`                                                 | `GBP; en-GB; Europe/London`                                                 |
| `web-settings-lists-the-profiles`                 | passed | `Example Ltd,Demo Person`                                                   | `Example Ltd,Demo Person`                                                   |

## Capability drives

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

PASS: 17 steps ran, 37 expectations held against the seeded demo book.

## What this proves

- The migrations and the demo seed fill a real SQLite database with the demo book.
- Every money value read back is an integer of minor units with an ISO currency code.
- Every expectation named above matched its observation for the demo data.
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
