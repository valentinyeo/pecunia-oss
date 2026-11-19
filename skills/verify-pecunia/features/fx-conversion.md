# FX conversion

Status: planned. The rate table, the conversion columns, and two foreign demo lines exist on `main`. No capability, screen, CLI command, or MCP tool yet.

## What it promises

- A line whose source currency differs from the profile base currency carries a rate and the date of that rate. The schema rejects a foreign line without them.
- The base amount is the source amount times the rate, rounded once to a whole minor unit. The database check allows at most one minor unit of difference so currencies with different exponents do not reject a correctly rounded line.
- A same-currency line carries no rate and its base amount equals its source amount.
- Currencies have real minor-unit exponents, from 0 (`JPY`) to 4 (`CLF`). The conversion scales by the exponent difference, so a `JPY` amount does not lose two digits.
- The demo book backs each rate date with a monthly rate row, one pair per month for the year. A real rate adapter can be finer grained; the promise is the stored rate and its date, not the cadence.
- Pecunia converts for display and totals. It never trades or moves money.

## Sub-features

- Rate table keyed by base currency, quote currency, and date.
- Source amount, source currency, base amount, base currency, rate, and rate date on a bank line.
- Fee amount and fee currency, which must match the source currency.
- Conversion for dashboard totals, subscriptions, and tax when the source currency differs from the base.
- Rate fetching from a provider is planned. Today the demo rates are fixtures, and a real adapter is a port behind `packages/core`.

## How to get to it (user POV)

Today: nowhere. The conversion is visible only in the demo rows and the proof output.

Planned: the amount shown in a line detail or a dashboard total, with the rate and its date beside it. The slice that adds the surface names the route.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature fx-conversion
```

The demo book has one USD line and one GBP line, plus ten EUR lines. The foreign lines are `transaction-demo-03` (2999 USD at 0.922 to 2765 EUR) and `transaction-demo-05` (12000 GBP at 1.17 to 14040 EUR).

Checks this drive runs, on top of the four cross-cutting money checks:

- `conversion-rounds-exactly`: every foreign base amount equals the source amount times the rate, rounded to a minor unit.
- `conversion-keeps-same-currency`: a same-currency line keeps its amount and carries no rate.
- `conversion-has-a-monthly-rate`: every foreign line has a rate row for its month, in one direction or the other.
- `conversion-recorded-lines`: the two demo conversions are the exact expected values.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. The line or total on screen with the source amount, rate, rate date, and base amount, next to the stored row.
3. A property test over generated amounts, currencies, and rates: the base amount is an integer, the same-currency case is identity, and the conversion never uses a float.
4. A test for the exponent edges: a 0-exponent currency and a 4-exponent currency across a conversion.
5. If the change adds a rate provider, the port and a recorded response, plus the same conversion computed twice from it.

## Gotchas

- A rate is the only float allowed near money, because it is a ratio. The amount it produces is an integer.
- The database check allows one minor unit of difference to absorb exponent scaling and rounding. The demo rows land exactly, and the proof asserts exact values.
- The rate direction matters. A USD to EUR line at 0.922 and a EUR to USD rate of 1.07 are not the same number. Store the rate the conversion used, with its date.
- Monthly demo rates are dated the first of the month. A rate date in the middle of the month still matches that month's row.
- Never convert an already-converted total again. Convert source lines once, then sum base amounts.
