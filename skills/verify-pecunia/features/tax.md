# Tax

Status: planned. The tax profile, two demo VAT obligations, and one settlement exist on `main`. No capability, screen, CLI command, or MCP tool yet.

## What it promises

- A tax profile says the jurisdiction and the first day of the tax year. The demo profile is `GB`, starting 6 April.
- An obligation is a named period with a due date, an amount, a status, and a books status. Status is `estimated`, `paid`, or `written_off`.
- A paid obligation points at exactly one bank line. A unique index on the settlement prevents counting one payment twice.
- A paid obligation's amount, currency, and the settling line's base amount agree. A mismatch is a named state, not a silent adjustment.
- An open obligation carries no settlement. A written-off obligation says why.
- Pecunia records what is due and what was paid. It does not recommend a tax position.

## Sub-features

- Tax profile with jurisdiction, year start month, year start day, and the primary profile flag.
- Obligation list with kind (`vat` and the other kinds the slice adds), period end, due date, label, amount, currency, status, and books status.
- Settlement: link a paid obligation to one bank line classified `tax_payment`.
- Written-off obligations with a reason.
- Synced-at timestamp for the source that produced the obligation.
- Filing and e-filing are planned. They are not part of the promise until a slice adds them.

## How to get to it (user POV)

Today: nowhere. The demo book carries the obligations and the settlement.

Planned: the tax section of the app. The slice that adds it names the route, and the same capability reaches MCP and the CLI.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature tax
```

The demo book has one UK tax profile and two VAT obligations: an estimated 312500 EUR minor units for the quarter ending 30 September 2025, and a paid 250000 for the quarter ending 30 June 2025, settled by `transaction-demo-09` (250000, classified `tax_payment`).

Checks this drive runs, on top of the four cross-cutting money checks:

- `tax-settles-once`: every paid obligation is settled by a `tax_payment` line of the same amount and currency.
- `tax-unpaid-has-no-settlement`: an unpaid obligation carries no settlement id.
- `tax-paid-total`: paid tax is 250000 EUR minor units.
- `tax-unpaid-total`: unpaid tax is 312500 EUR minor units.
- `tax-year`: the demo tax year is `GB`, starting 4-6.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. The obligation on screen with its amount, period, due date, status, and the settling line, next to the rows.
3. A focused test for settlement. The same payment cannot settle two obligations, and a paid obligation cannot be left without a line.
4. A property test over generated obligations and settlement attempts if the change touches the matching rule: settlement stays one-to-one and the amounts stay exact.
5. If the change computes an estimate, the inputs and the rounding are named. An estimate is not advice, and the screen must say so.

## Gotchas

- Paid and unpaid totals are separate. Adding them gives a number that means nothing.
- The demo tax payment is a bank line, not a second obligation. Counting both double counts 250000.
- The UK tax year starts 6 April, not 1 January. A quarterly period can cross a year boundary.
- The settlement line must be classified `tax_payment`. A line that merely mentions tax is not a settlement.
- `books_status` is a label from the source, not a boolean. Do not branch on an empty string as if it meant paid.
- `tax_obligations.status` is limited to `estimated`, `paid`, and `written_off`. A new state needs a schema change and a numbered migration.
