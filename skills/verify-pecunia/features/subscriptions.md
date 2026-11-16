# Subscriptions

Status: planned. The schema and two demo subscriptions exist on `main`. No capability, screen, CLI command, or MCP tool yet.

## What it promises

- One subscription per payee per profile. The database enforces the uniqueness.
- A subscription keeps its typical charge in the source currency and in the profile's base currency, both integer minor units.
- The annual cost comes from the frequency: weekly x 52, monthly x 12, quarterly x 4, annual x 1.
- Only `confirmed` and `detected` subscriptions count as active cost. `dismissed`, `not_recurring`, and `cancelled` stay out.
- The next expected charge and the last charge are dates, so the screen can say what is due next without guessing.
- Pecunia observes subscriptions. It never cancels one or moves money.

## Sub-features

- Subscription list with payee, frequency, typical charge, base charge, status, and confidence.
- Status changes with a timestamp: `detected`, `confirmed`, `dismissed`, `not_recurring`, `cancelled`.
- Next expected charge date and occurrence count.
- Annual cost per subscription and in total, in base currency minor units.
- Category and notes on a subscription.
- Detection is planned as part of the sync work. This page covers the promise and the verification once detection lands.

## How to get to it (user POV)

Today: nowhere. The demo book carries the two subscriptions.

Planned: the subscriptions section of the app. The slice that adds it names the route, and the same capability reaches MCP and the CLI.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature subscriptions
```

The demo book has a confirmed monthly `Demo Cloud Hosting` subscription at 29900 EUR minor units and a cancelled weekly `Demo Coffee` subscription at 4250.

Checks this drive runs, on top of the four cross-cutting money checks:

- `subscriptions-have-a-frequency-rule`: every counted subscription uses one of the four frequencies.
- `subscriptions-active`: one demo subscription is active.
- `subscriptions-annual-cost`: the active subscription annualizes to 358800 EUR minor units.
- `subscriptions-cancelled`: the cancelled subscription is present and outside active cost.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. The active subscriptions on screen with their typical charge, frequency, and annual cost, plus the total.
3. A focused test for the frequency table. A property test over generated frequencies and amounts: the annual cost is always an integer, uses the base amount, and scales by the frequency multiplier.
4. A test that a cancelled, dismissed, or not-recurring subscription never enters active cost.
5. If the change adds detection, the history that proves it: the lines, the payee, the detected frequency, and the confidence. A half-detected subscription is a named state.

## Gotchas

- Weekly x 52 is a year of weekly charges. Do not use 4 x 12.
- A subscription's `typical_minor` is in `typical_currency`; `typical_base_minor` is in the profile base currency. Annualize the base amount, never the source amount.
- The cancelled demo subscription still has a next expected date. Do not read that date as an active renewal.
- Confidence and `amount_cv` are evidence for the detection model. They are not a price and must never be summed.
- The unique key is `(profile_id, payee_id)`. Two providers charging the same payee are one subscription, not two.
