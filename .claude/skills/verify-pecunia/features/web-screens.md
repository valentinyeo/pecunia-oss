# App screens

Status: partly built. The app serves twelve screens under `/app`: Dashboard, Transactions, Review, Search, Budgets, Subscriptions, Investments, Categories, Rules, Aliases, Merchants, and Settings. All twelve render and answer clicks. Budgets is a placeholder. None of them reads the database: each draws a client-side fixture.

## What it promises

- Every screen the sidebar names has an address under `/app` and renders without a console error, except the Budgets placeholder.
- A click on a control on one of these screens changes what the same screen shows. The drive types in the search boxes, chooses a month, opens the edit forms, and follows a link, then reads the result off the page.
- A screen that shows money shows it as a currency amount with a symbol and two decimals, formatted from integer minor units. No float and no bare number reaches the page.
- A screen that has no data says so. Budgets says the screen lands in a later slice; the transactions search says no bank line matches.
- Demo data is labelled as demo data. The dashboard, categories, settings, and search screens each say in words that the figures are made up.

Not built yet: a screen reading a capability over RPC or D1. Every screen here draws `apps/web/src/client/**` fixtures and writes to the browser's memory, so nothing a user does on one survives a reload or reaches the demo book.

## How to get to it (user POV)

Today: open the app, pick a screen from the left sidebar under Money, Sorting, or Account. The sidebar is the map: Dashboard, Transactions, Review, Search, Budgets, Subscriptions, Investments, then Categories, Rules, Aliases, Merchants, then Settings.

Planned: the screens read the reporting, categorisation, subscription, and investment capabilities over RPC for the signed-in profile. The slice that adds each transport updates this page and the feature page that owns that capability.

## Driving it with the demo book

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature web-screens
```

This run starts with the shared steps, builds the web app, serves it on a free loopback port, and drives all twelve screens in headless Chromium with real clicks. It is the one run that owns the browser, so the twelve screen checks live here even when a money feature page describes the same screen. The money pages link here instead of repeating the ids, because an expectation id belongs to one feature page.

Checks this drive runs, on top of the four cross-cutting money checks:

- `web-dashboard-net-worth`: the summary's Net worth figure reads `£48,250.00`.
- `web-dashboard-net-worth-matches-accounts`: Net worth equals the sum of the three account balances on the same page, in pence.
- `web-dashboard-spend-by-category`: the spend bars name six categories, from `Rent` to `Everything else`.
- `web-transactions-lists-every-demo-line`: the screen lists 12 lines.
- `web-transactions-search-narrows-the-list`: typing `Demo Coffee` in the search box narrows the list to the 2 Demo Coffee lines.
- `web-transactions-category-link-filters-the-list`: clicking a line's category link leaves 2 lines, the Software ones.
- `web-transactions-category-link-is-its-own-url`: that click lands on `/app/spending/category/<id>`, its own address.
- `web-transactions-edit-form-opens`: the first line's Edit button opens a form labelled Category and Note.
- `web-categories-spend-table`: the March table's first row is `Everything else` with its own spend, its total with children, and its share, all three in the same row.
- `web-categories-month-picker`: choosing `Jan 2026` retitles the table `Spend in Jan 2026` and keeps the same first row.
- `web-categories-management-lists-every-category`: the management table lists 9 categories.
- `web-rules-lists-every-rule`: the rules table lists 6 rules.
- `web-rules-shows-the-pattern`: the first rule row names `Demo Grocer`, its contains pattern, and the `Groceries` category its select shows.
- `web-rules-new-rule-form-opens`: the New rule button opens a form with a Least amount field.
- `web-aliases-lists-every-alias`: the aliases table holds 4 merchant aliases and leaves the other 4 merchants at `No aliases yet`.
- `web-aliases-shows-the-match-kind`: one alias matches on `prefix`, so the three match kinds are not collapsed into one.
- `web-aliases-new-alias-form-opens`: the New alias button opens a form with a `Text on the statement` field.
- `web-merchants-lists-every-merchant`: the header reads `8 of 8 merchants`.
- `web-merchants-filter-narrows-the-list`: choosing `No category yet` narrows the header to `2 of 8 merchants`.
- `web-merchants-shows-count-and-total`: the `Demo Grocer` row reads 12 payments and `£1,036.80` spent.
- `web-review-lists-uncategorised-lines`: the review list holds 5 lines with no category.
- `web-review-suggests-categories`: clicking Suggest categories answers `2 suggestions are ready.` and the lines keep their empty category, because a suggestion is not a write.
- `web-search-suggests-while-typing`: typing `Demo` offers 5 suggestions.
- `web-search-finds-payments-and-holdings`: pressing Search answers with a Holdings section and a Payments section holding 11 rows.
- `web-budgets-is-a-later-slice`: Budgets renders the sentence `This screen lands in a later slice. The demo book has no data for it yet.` and nothing else.
- `web-subscriptions-lists-repeat-payments`: the list holds `Demo Cloud Hosting` and `Demo Coffee`, in that order.
- `web-subscriptions-shows-frequency`: the two rows read `Monthly · €3,588.00 a year` and `Weekly · €2,210.00 a year`.
- `web-subscriptions-shows-confidence`: the two rows read `96% confidence` and `61% confidence`.
- `web-subscriptions-shows-the-annual-total`: the totals read `€299.00` active monthly and `€3,588.00` active yearly.
- `web-subscriptions-filters-to-active`: All holds 2 rows, Active holds 1, and 1 of the two is confirmed.
- `web-subscriptions-cancels-a-repeat-payment`: cancelling `Demo Cloud Hosting` takes the active yearly total to `€0.00`.
- `web-investments-groups-holdings-by-platform`: the screen shows the `Generic Broker` and `Generic Crypto Exchange` groups.
- `web-investments-shows-a-priceless-holding`: exactly 1 cell reads `No price yet`, and it belongs to the pending `Demo Tech Stock`.
- `web-investments-shows-value-and-gain`: the `Demo Bitcoin` row reads value `€86,400.00` and gain `€80,400.00`.
- `web-settings-shows-the-demo-values`: the three fields read `GBP`, `en-GB`, and `Europe/London`.
- `web-settings-lists-the-profiles`: the profile list reads `Example Ltd` and `Demo Person`.

Each screen step writes one full-page screenshot next to `proof.json`: `web-dashboard.png`, `web-transactions.png`, `web-categories.png`, `web-rules.png`, `web-aliases.png`, `web-merchants.png`, `web-review.png`, `web-search.png`, `web-budgets.png`, `web-subscriptions.png`, `web-investments.png`, and `web-settings.png`.

## Proof a pull request must attach

1. The app screens run with a fresh label, and its evidence committed, screenshots included.
2. For a screen change: the screenshot before and after, and the capability output behind the number on it. A screenshot alone proves the layout, not the sum.
3. A focused test at the client seam for any new state. A submodel's update is a pure function; test the messages, not the pixels.
4. A test that a screen with no data renders the empty sentence rather than a zero. A zero is a number a user will believe.
5. If a screen starts reading a capability, the capability's route in the proof and the screen reading the same value the route returns. One contract, every surface.

## Gotchas

- Budgets is a placeholder. `web-budgets-is-a-later-slice` proves the sentence, not a budget. There is no budget table and no budget capability.
- The screens draw client fixtures, not the demo book. The dashboard's `£48,250.00` and the transactions screen's 12 lines come from different files and do not describe the same book. A number read on a screen is never evidence for a capability.
- The transactions screen draws 6 categories from `apps/web/src/client/pecunia/catalogue.ts`; the categories screen draws 9 from `apps/web/src/client/pecunia/categorize/demo.ts`. The two fixtures disagree, so a category picked on one has no id on the other.
- The category drill-down at `/app/spending/category/<id>` filters the list but keeps the heading `Transactions` and the notice about every line the demo sync wrote. A user who follows a category link cannot read which category they are on from the page.
- The categories month picker changes the table's title and never its numbers, because the demo fixture generates the same payments for every month in its list.
- The dashboard screen has no period picker. The shared picker in `packages/reporting/src/date.ts` has no control on this page yet.
- Every write on these screens lands in the browser's memory. Reload the page and it is gone. The drive is read-only for that reason: a click that writes would prove nothing that outlives the tab.
- The headless browser is Playwright. The helper resolves it from the workspace or from the global npm root and names the install command when it finds neither. It is not a dependency of this repository.
