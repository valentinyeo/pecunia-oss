# Dashboard sums

Status: planned. The demo transactions and categories exist on `main`. No dashboard screen, capability, CLI command, or MCP tool yet.

## What it promises

- A total is the sum of exactly the lines it names. Posted spend counts posted, outbound lines with no classification. Pending lines, transfers, refunds, tax payments, and excluded lines stay out.
- Every sum is integer minor units in the profile's base currency. No float touches a total.
- A parent category includes its children. `Software` includes `Cloud`.
- A category total and the overall total agree. The same filter produces the same number on the dashboard, the web RPC, MCP, and the CLI.
- Budgets will use the same sums. There is no budget table yet; a budget feature adds one and its own page here.

## Sub-features

- Spend total for a period.
- Income total, kept separate from refunds and transfers.
- Category totals, including the parent rollup.
- Pending lines shown, but not counted as posted spend.
- Excluded, internal transfer, self transfer, refund, and tax payment lines shown with their reason.
- A per-line breakdown behind every total.
- Stored report pages (`reports` table) are generated output; they are not a source of truth for a sum.

## How to get to it (user POV)

Today: nowhere. The numbers below are read from the demo book.

Planned: the dashboard screen the ui-shell slice adds, with the sums coming from capabilities that the web, MCP, and CLI share. That slice names the exact route and tool.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature dashboard-sums
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

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. The screen or capability output next to the lines behind it: the total, the filter, and a per-line breakdown that sums to it.
3. A property test if the change touches a sum rule. The test generates lines over the classification and status ranges and checks the invariant, for example that a sum over a filtered set never exceeds the sum over the whole set.
4. A test that a pending line, a transfer, and an excluded line never enter posted spend. Each is a different way to double count.
5. The same number from two surfaces when the change adds a surface. One contract, every surface.

## Gotchas

- `328955` is EUR 3,289.55. Do not divide by 100 to compare; compare minor units.
- A pending line is a forecast, not spend. `transaction-demo-12` is 5200 and must stay out of the posted total.
- The refund at `transaction-demo-10` is a credit but not income. It carries classification `refund`.
- The tax payment at `transaction-demo-09` is 250000 and outside spend. Counting it as spend double counts the obligation.
- The parent rollup must join on `parent_id`, not on a name prefix. The category tree is a real tree.
- The personal profile has no transactions. A query without `profile_id` returns the business sums for everyone and hides the bug on this demo book.
