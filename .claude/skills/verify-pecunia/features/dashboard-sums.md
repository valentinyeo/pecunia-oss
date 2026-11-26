# Dashboard sums

Status: partly built. The read capabilities and their package tests exist on the branch of [pull request 21](https://github.com/valentinyeo/pecunia-oss/pull/21) in `packages/reporting`, not yet on `main`. The dashboard screen renders at `/app` over a separate client-side fixture, so the sums a user sees are made up and do not come from those capabilities. No web RPC wiring, D1 store, tax-owed provider adapter, CLI command, or MCP mount reaches them yet.

## What it promises

- A total is the sum of exactly the lines it names. Posted spend counts posted, outbound lines with no classification. Pending lines, transfers, refunds, tax payments, and excluded lines stay out.
- Every sum is integer minor units in the profile's base currency. No float touches a total.
- A parent category includes its children. `Software` includes `Cloud`.
- A category total and the overall total agree. The same filter produces the same number on the dashboard, the web RPC, MCP, and the CLI.
- Every sum belongs to one profile. A reader who belongs to another profile gets `Forbidden`, and a profile with no book gets zeros and no rows.
- Budgets will use the same sums. There is no budget table yet; a budget feature adds one and its own page here.

## Capabilities

- `readDashboard` (`packages/reporting/src/capabilities.ts`) returns money in, money out and the net for one period, spend split by the currency paid, a daily spend series, the most recent payments, the total balance, tax owed from the book's obligations, and the month's projected spend.
- `readCategories` (`packages/reporting/src/capabilities.ts`) returns spend per category for one period, each root category's share in basis points, the live category count, and the uncategorised spend.
- `readSpending` (`packages/reporting/src/capabilities.ts`) returns personal, business and mixed spend with their shares, the same spend by category, and a stacked month-by-month series.
- `readCategoryPayments` (`packages/reporting/src/capabilities.ts`) returns one category's spend payments for a period, newest first, with a parent category carrying its children's payments.
- `readIncome` (`packages/reporting/src/capabilities.ts`) returns income grouped by client from the classification, never the merchant, with refunds kept apart and a dense monthly series.
- `readMonth` (`packages/reporting/src/capabilities.ts`) returns one month's statement: totals, spend by category, daily spend, top merchants, repeat payments, and every counted payment.
- `listMonths` (`packages/reporting/src/capabilities.ts`) returns the months the book already holds, newest first.
- `spendingSummary` (`packages/reporting/src/capabilities.ts`) returns spend by category over an explicit date range for an agent.
- `incomeSummary` (`packages/reporting/src/capabilities.ts`) returns income by client over an explicit date range for an agent.
- `monthlyTotals` (`packages/reporting/src/capabilities.ts`) returns month by month money in, money out and the net over an explicit date range for an agent.

All are implemented and tested at the package level, against a memory source keyed by profile. Not built yet: the dashboard screen and its web RPC wiring, the D1 store behind `ReportSource`, an adapter that reads tax owed from the accounting provider, and the CLI and MCP mounts for the three tools. The slice that adds each one updates this page with the exact route, tool, and command.

## Sub-features

- Spend total for a period.
- Income total, kept separate from refunds and transfers.
- Category totals, including the parent rollup.
- Pending lines shown, but not counted as posted spend.
- Excluded, internal transfer, self transfer, refund, and tax payment lines shown with their reason.
- A per-line breakdown behind every total.
- Stored report pages (`reports` table) are generated output; they are not a source of truth for a sum.

## How to get to it (user POV)

Today: the read capabilities through their package handlers with the package demo seed, and a dashboard screen at `/app` whose figures come from `apps/web/src/client/pecunia/demo-data.ts`. The screen is not wired to these capabilities and reads no database; it exists so the layout can be seen.

Planned: the dashboard screen the ui-shell slice adds, with the sums coming from these capabilities that the web, MCP, and CLI share. That slice names the exact route and tool, not before.

## Driving it with the demo book

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature dashboard-sums
```

The demo book has 12 lines for `Example Ltd`: one posted income, one posted refund, one internal transfer, one self transfer, one posted excluded line, one posted tax payment, one pending outgoing line, and five posted outgoing lines with no classification.

Checks this drive runs, on top of the four cross-cutting money checks:

- `dashboard-spend`: posted spend is 328955 EUR minor units.
- `dashboard-spend-lines`: those minor units come from `transaction-demo-02`, `03`, `04`, `05`, and `11`.
- `dashboard-income`: posted income is 480000.
- `dashboard-transfers`: internal and self transfers total 160000 and are outside spend.
- `dashboard-excluded`: the excluded line is 1500 and is outside spend.
- `dashboard-pending`: `transaction-demo-12` is pending, so it is not posted spend.
- `dashboard-category`: posted `Cloud` is 299000.
- `dashboard-parent-category`: `Software` includes its `Cloud` child and is also 299000.

This drive reads the SQLite demo book. The package tests read a different demo seed, `packages/reporting/src/demo.ts`, whose March spend is 90945 EUR minor units for the demo profile and 2500 GBP minor units for the second profile.

### The dashboard screen

`/app` renders the dashboard. The app screens feature drives it in headless Chromium with real clicks and writes `web-dashboard.png`, a full-page screenshot. Its three checks are `web-dashboard-net-worth`, `web-dashboard-net-worth-matches-accounts`, and `web-dashboard-spend-by-category`, listed on [App screens](web-screens.md) because that run owns the browser:

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature web-screens
```

They prove the screen's own fixture, not the sums above.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. The capability output next to the lines behind it: the total, the filter, and a per-line breakdown that sums to it.
3. A property test if the change touches a sum rule. The test generates lines over the flow kinds and statuses and checks the invariant, for example that a sum over a filtered set never exceeds the sum over the whole set.
4. A test that a pending line, a transfer, and an excluded line never enter posted spend. Each is a different way to double count.
5. A test that one profile's book never answers for another profile, covering every read capability.
6. The same number from two surfaces when the change adds a surface. One contract, every surface.

## Gotchas

- The dashboard screen's numbers are a client fixture in `apps/web/src/client/pecunia/demo-data.ts`: `£48,250.00` net worth, `£2,318.47` spent this month, six spend categories. They do not come from the seeded SQLite book and they do not agree with it. Never read a dashboard figure as a sum over `transactions`.
- The dashboard screen has no period picker. The shared picker in `packages/reporting/src/date.ts` has no control on this page yet.
- `328955` is EUR 3,289.55. Do not divide by 100 to compare; compare minor units.
- A pending line is a forecast, not spend. `transaction-demo-12` is 5200 and must stay out of the posted total.
- The refund at `transaction-demo-10` is a credit but not income. It carries classification `refund`.
- The tax payment at `transaction-demo-09` is 250000 and outside spend. Counting it as spend double counts the obligation.
- The parent rollup must join on `parent_id`, not on a name prefix. The category tree is a real tree.
- The package demo seed and the SQLite demo book are two different fixtures. A number from one is not a number from the other.
- The memory source in `packages/reporting/src/memory.ts` keys its books by profile id. A missing profile gets an empty book, never another profile's rows.
