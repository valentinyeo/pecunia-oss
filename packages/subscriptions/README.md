# `@pecunia/subscriptions`

Find the repeat payments in a profile's history, list what each costs in a month and a year, and change one profile's notice of it.

## What it owns

- `model.ts`: the repeat payment, its frequency, its explicit notice, and the request shapes. Illegal states are schema failures: a notice without the time it changed, a restore target of `Cancelled`, a payment of zero minor units, a currency that is not three upper-case letters, a date such as `2025-02-30`.
- `civil.ts`: calendar arithmetic with no `Date`. A day number, its inverse, day and month shifts, and a calendar check. `shiftMonths` clamps to the month that lands, so 31 January plus one month is 28 February and 29 February in a leap year.
- `schedule.ts`: the frequency table. Weekly is 52 charges a year, monthly 12, quarterly 4, annual 1, and the next charge is last plus one week or one, three or twelve months.
- `cost.ts`: `annualOf` multiplies the typical base charge by the frequency, in `BigInt`, and refuses a cost past the range an integer minor unit holds as `SubscriptionCostOverflow`. `monthlyOf` divides the annual cost by twelve and rounds down, so the monthly rows add up to the monthly total. `pageOf` keeps only confirmed and detected notices in active cost, gives an inactive notice no next charge, and refuses to add base costs kept in another currency as `BaseCurrencyMismatch`.
- `status.ts`: the notice rule. `Confirm`, `Dismiss`, `MarkRecurring`, `MarkNotRecurring` and `Cancel` land on exactly one notice each; `Restore` lands on the notice the row held and is refused as `IllegalStatusChange` unless the row is cancelled. Sending the notice a row already holds keeps the first time.
- `detect.ts`: the finder. A payee is claimed only with at least three outgoing payments, a payee row, and a median gap inside one of the four bands; with an even count the median is the mean of the two middle values, rounded down. The typical charge is the median payment in the payee's most-used charged currency, never a sum. The typical base charge is the median of those same charges' base amounts in their most-used base currency, and a tie goes to the currency seen first in time order, so a number is never paired with a currency it was not measured in. Confidence is one minus the worst gap's distance from the nominal length. Incoming payments and payees without a row are skipped.
- `store.ts` and `memory.ts`: the port and the reference adapter. The adapter applies the notice and category rules inside one `Ref` step, so a cancellation and a restoration cannot interleave, and one mark per payee per profile is unrepresentable because `mark` confirms the existing row instead of adding a second. A mark that names a frequency the row does not hold takes that frequency and its next charge date, so the costs are recomputed; a second mark with the same frequency keeps the first time.
- `service.ts` and `capabilities.ts`: `SubscriptionService` is the only path to the store, and the five capabilities `listSubscriptions`, `findRepeatPayments`, `markRepeatPayment`, `changeSubscriptionStatus` and `setSubscriptionCategory` are the same contracts every surface projects. Reads need profile membership, writes need ownership.
- `demo.ts`: the made-up demo book. `Demo Cloud Hosting` at 29900 EUR monthly, confirmed; `Demo Coffee` at 4250 EUR weekly, cancelled; 11, 6 and 3 past payments behind them, plus one refund that detection ignores.

## What it does not own yet

The store is in memory, so notices and categories live as long as the process. A Cloudflare D1 adapter over `subscriptions` is the next slice: `SubscriptionStore` is the port it plugs into, and `packages/database` already holds the table, its unique index on `(profile_id, payee_id)` and its checks. That adapter also decides how `amount_cv`, `notes` and `status_changed_at` map, which this shape does not carry today.

Past payments arrive through `SubscriptionStore.charges`, so the bank-line slice owns the adapter that reads `transactions`. A category push writes `transactions.category_id` through the same port.

Two local types stand in for `@pecunia/core`'s domain module until it lands on `main`: `Payment` (a currency code plus integer minor units, greater than zero) and `Money` (the same, signed). Replacing them is a one-file change in `model.ts`.

## Proof

`test/civil.property.test.ts` runs 700 seeded cases each over date round trips, day shifts, month shifts and next-charge gaps, so the arithmetic is checked against its own inverse and the frequency bands are enforced on real calendar dates. `test/cost.property.test.ts` runs 700 seeded cases over amounts and frequencies and proves the annual cost equals the payment times a literal 52, 12, 4 or 1 charges a year, that the monthly cost never drifts a minor unit past twelve, and that the page total is the exact sum of the notices that count. `test/status.property.test.ts` runs 600 seeded cases over every notice and change pair and proves only a cancelled row restores, a repeated change keeps its first time, and every cancellation undoes to the notice it held. `test/detect.property.test.ts` runs seeded histories over varying charge amounts and varying gaps across each literal band and proves every band is claimed, the typical charge stays between the smallest and largest charge, an odd count picks a middle charge, no band is invented, and two payments, incoming money or a missing payee row never claim a repeat payment. `test/detect.test.ts` pins the literal cases: gaps of 9 and 25 days and of 9 and 35 days are not claimed, two gaps of 7 days are weekly, four gaps whose two middle values sit in one band are claimed, and a mixed base currency reports a number in the currency it was measured in. `test/subscriptions.service.test.ts` drives the demo book through the capabilities and proves the demo cost (358800 EUR annual, 29900 monthly), the finder, marking, re-marking an existing row with the caller's frequency, cancel and undo, the category push, the other-profile refusal, and the viewer and stranger refusals. `test/subscriptions.contracts.test.ts` proves the wire payloads parse or fail at the boundary, and that the five contracts project onto one RPC group with the reads marked read-only and nothing asking for approval.

```sh
cd packages/subscriptions
pnpm exec vitest run test
pnpm run check
```
