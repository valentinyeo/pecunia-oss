# Subscriptions

Status: partly built. The five repeat-payment capabilities exist on `main` with their package tests, and the screen renders them from an in-memory demo world. No database store, no past-payments port, and no assistant tool mount yet.

## What it promises

- One repeat payment per payee per profile. Marking a payee twice confirms its row instead of adding a second one.
- A repeat payment keeps its typical charge in the source currency and in the profile's base currency, both integer minor units. The base amount is measured only in the currency it is reported in.
- The annual cost comes from the frequency: weekly x 52, monthly x 12, quarterly x 4, annual x 1. The monthly cost is the annual cost divided by twelve and rounded down.
- Only confirmed and detected repeat payments count as active cost. Dismissed, not-recurring and cancelled stay out.
- The next expected charge and the last charge are dates, so the screen can say what is due next without guessing.
- A payee is claimed from its own outgoing payment history: at least three payments, a known payee row, and a median gap inside one band. The typical charge is the median payment, never a sum.
- Pecunia observes repeat payments. It never cancels one at the merchant or moves money.

## Capabilities

- `listSubscriptions` (`packages/subscriptions/src/capabilities.ts`) lists one profile's repeat payments with each one's monthly and annual cost and, for a live notice, the next charge.
- `findRepeatPayments` (`packages/subscriptions/src/capabilities.ts`) finds repeat payments in one profile's outgoing payment history and writes nothing.
- `markRepeatPayment` (`packages/subscriptions/src/capabilities.ts`) marks one payee as a repeat payment of one profile, and confirms the existing row with the caller's frequency when the payee already has one.
- `changeSubscriptionStatus` (`packages/subscriptions/src/capabilities.ts`) confirms, dismisses, marks recurring or not recurring, cancels, or restores one repeat payment inside the profile that holds it.
- `setSubscriptionCategory` (`packages/subscriptions/src/capabilities.ts`) sets or clears one repeat payment's category and pushes it onto the same payee's past payments.

All five are implemented and tested at the package level. Reads need profile membership and writes need ownership. The RPC, MCP, and CLI projections do not carry them yet; the slice that adds a projection updates this page with the exact route, tool, and command.

## Sub-features

- Repeat payment list with payee, frequency, typical charge, base charge, status, confidence, occurrence count, and next charge date.
- Status changes with a timestamp: `detected`, `confirmed`, `dismissed`, `not_recurring`, `cancelled`, and a restore back to the notice a cancelled row held.
- Detection from the payment history, with the band, the median gap, and the confidence behind each claim.
- Annual cost per repeat payment and in total, in base currency minor units, and the monthly figure that adds up to it.
- Category on a repeat payment, pushed onto its past payments.
- Not built: the subscriptions screen, the D1 store over the `subscriptions` table, the port that reads past payments from the bank lines, and the assistant tool mount in `apps/cli`.

## How to get to it (user POV)

Today: the five capabilities through their package handlers, the demo book through the package memory store, and a subscriptions screen at `/app/subscriptions` that lists the demo repeat payments through `SubscriptionsGateway` over the same handlers. The screen reads and cancels in the browser's memory, so a reload returns the demo rows.

Planned: the subscriptions section of the app. The slice that adds it names the route, and the same capabilities reach MCP and the CLI. This page gets the exact route and tool name from that slice, not before.

## Driving it with the demo book

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature subscriptions
```

The demo book has a confirmed monthly `Demo Cloud Hosting` repeat payment at 29900 EUR minor units and a cancelled weekly `Demo Coffee` repeat payment at 4250.

Checks this drive runs, on top of the four cross-cutting money checks:

- `subscriptions-have-a-frequency-rule`: every counted repeat payment uses one of the four frequencies.
- `subscriptions-active`: one demo repeat payment is active.
- `subscriptions-annual-cost`: the active repeat payment annualizes to 358800 EUR minor units.
- `subscriptions-cancelled`: the cancelled repeat payment is present and outside active cost.

Read a failure with `jq '.checks[] | select(.passed | not)' .claude/skills/verify-pecunia/evidence/<date>-<label>/proof.json`.

### The subscriptions screen

`/app/subscriptions` is the screen. The app screens feature opens it in headless Chromium and writes `web-subscriptions.png`, the loaded list. Its checks are on [App screens](web-screens.md) because that run owns the browser:

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature web-screens
```

The screen draws `SubscriptionService` over the package demo seed, not the SQLite demo book, so its numbers agree with `packages/subscriptions/src/demo.ts` and not with `demoNumbers`.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. The active repeat payments on screen with their typical charge, frequency, and annual cost, plus the total.
3. A focused test for the frequency table. A property test over generated frequencies and amounts: the annual cost is always an integer, uses the base amount, and matches the literal 52, 12, 4 or 1 charges a year.
4. A test that a cancelled, dismissed, or not-recurring repeat payment never enters active cost.
5. For detection: the literal gaps that are and are not claimed, and a property that the typical charge stays between the smallest and largest charge and equals a middle charge for an odd count.
6. For a mark on an existing repeat payment: the row takes the caller's frequency, its costs come out of that frequency, and a second mark with the same frequency keeps the first time.

## Gotchas

- Weekly x 52 is a year of weekly charges. Do not use 4 x 12.
- The typical charge is in the charged currency; the typical base charge is in the profile's base currency. Annualize the base amount, never the charged amount.
- With an even count the median is the mean of the two middle values, rounded down. Taking the lower middle value turns gaps of 9 and 25 days into a weekly claim.
- A base amount is only reported in a currency the charges were measured in. A mix of base currencies picks the most used one, breaking a tie by the currency seen first.
- The cancelled demo repeat payment still has a next expected date. Do not read that date as an active renewal.
- Confidence is evidence for the detection model. It is not a price and must never be summed.
- Marking is one repeat payment per payee per profile. Two providers charging the same payee are one repeat payment, not two.
