# Investments

Status: planned. The holdings schema and three demo holdings exist on `main`. No capability, screen, CLI command, or MCP tool yet.

## What it promises

- A holding keeps quantity in millionths of a unit, the last price in integer minor units, and the cost basis in integer minor units.
- Value is quantity x price in integer arithmetic, rounded once to a minor unit. A float never touches a position value.
- A holding with no price has an unknown value, not a zero value. It stays out of the known total and says so.
- Price and currency are a pair. Cost basis and currency are a pair. The schema rejects half a pair.
- A pending holding carries no price. The schema rejects a price on a pending holding.
- Pecunia shows what a position is worth and what it cost. It never recommends buying, selling, or holding.

## Sub-features

- Holding list with name, symbol, asset type (`stock`, `etf`, `fund`, `crypto`, `cash`), state, quantity, price, value, and gain.
- Investment platforms, so a holding knows where it is held.
- Cost basis and gain, only when both the basis and the price exist.
- Pending holdings, shown without a value.
- Portfolio total of known values, with the unknown holdings counted separately.
- Price history and price updates are planned. Today a holding carries its last price and the time it was priced.

## How to get to it (user POV)

Today: nowhere. The demo book carries the holdings.

Planned: the investments section of the app. The slice that adds it names the route, and the same capability reaches MCP and the CLI.

## Driving it with the demo book

```sh
bash skills/verify-pecunia/scripts/prove-demo-book.sh --feature investments
```

The demo book has three holdings for `Example Ltd`: `Demo Bitcoin` (12 units at 720000 EUR minor units), `Demo World ETF` (1500 units at 520000), and `Demo Tech Stock` (pending, no price, cost basis not set).

Checks this drive runs, on top of the four cross-cutting money checks:

- `holdings-value-math`: `Demo Bitcoin` is worth 8640000 with a gain of 8040000, and `Demo World ETF` is worth 780000000 with a gain of 779550000.
- `holdings-stay-whole-cents`: quantity x price always lands on a whole minor unit for the priced demo holdings.
- `holdings-pending-unknown`: the pending holding has no price.
- `holdings-known-value`: the known total is 788640000 EUR minor units, and the pending holding is outside it.
- `holdings-platforms`: every holding's platform exists.

## Proof a pull request must attach

1. The demo-book run for this feature with a fresh label, and its evidence committed.
2. The position on screen with quantity, price, value, cost basis, and gain, next to the row that stores them.
3. A property test for any value or gain rule. Generate quantities and prices over a range, and check that the value is an integer, that it never uses a float, and that an unknown price stays unknown.
4. A test for the null pair: a holding with no price is not zero, and a pending holding cannot carry a price.
5. If the change adds price history or a provider, the provider port and its recorded response, plus the same value computed twice from it.

## Gotchas

- Quantity is millionths. `1500000000` is 1500 units, not 1.5 billion.
- The demo fixtures have very large gains because the prices are made up. Assert the exact demo values; do not present them as realistic returns.
- `780000000` is EUR 7,800,000.00 in minor units. Compare minor units.
- The `investments` provider account in the demo book has no bank lines; the holdings are the investment data.
- A closed position still exists. Do not filter the table by state unless the feature says so.
- Value rounding happens once, on the full quantity x price product. Rounding each position's unit price first changes the total.
