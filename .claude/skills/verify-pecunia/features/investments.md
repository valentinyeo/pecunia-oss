# Investments

Status: partly built. The six investment capabilities exist in `packages/investments` with their tests, and the app renders the demo book on the investments route. No RPC route, MCP tool, or CLI command carries them yet, and the holdings live in a memory store, not in D1.

## What it promises

- A holding keeps quantity in millionths of a unit, the last price in integer minor units, and the cost basis in integer minor units.
- Value is quantity x price in integer arithmetic, rounded once, half away from zero. A float never touches a position value.
- A holding with no price has an unknown value, not a zero value. It stays out of the known total and says so.
- Every checked multiply, add and conversion goes through one helper that answers a named reason: out of range, no rate, no price, or no cost. A failure never becomes an empty value.
- An average price times a quantity past the exact integer range fails the sync by name and field: `instruments[<n>].averagePrice`. A holding with no average price is a different answer, `no-cost`, and it still lands.
- A conversion that overflows is out of range, and a rate that is missing is a missing rate. The two never collapse into one.
- A total past the exact integer range says so by name. The screen never reports zero unknowns while showing no total.
- Price and currency are a pair. Cost basis and currency are a pair.
- A pending holding carries no price. The schema rejects a price on a pending holding.
- Every holding belongs to one profile. A member of one profile reads only that profile's holdings. The store refuses a holding written under a profile it does not name, by name.
- Pecunia shows what a position is worth and what it cost. It never recommends buying, selling, or holding.

## Capabilities

- `readInvestmentPortfolio` (`packages/investments/src/capabilities.ts`) reads one profile's holdings grouped by platform, valued in the profile's base currency, with the unknown holdings counted separately.
- `addHolding` (`packages/investments/src/capabilities.ts`) adds one holding to a profile by hand, refusing a duplicate symbol on the same platform.
- `editHolding` (`packages/investments/src/capabilities.ts`) edits one holding's name, quantity, cost basis and price, with each field an explicit change.
- `deleteHolding` (`packages/investments/src/capabilities.ts`) deletes one holding and returns what left the book.
- `syncInvestmentHoldings` (`packages/investments/src/capabilities.ts`) runs the broker holdings sync for one provider account and platform, creating holdings it has not seen and updating the ones it has.
- `refreshInvestmentPrices` (`packages/investments/src/capabilities.ts`) refreshes each holding's last price from its asset type's source, shares and funds from the market source and crypto from the second source.

All six are implemented and tested at the package level. The store behind them is the memory adapter. What is not built:

- A D1 store over the `holdings` table, and the numbered migration that carries it.
- The cron wiring that starts the broker sync on the shared schedule.
- The RPC mount and the CLI composition that project these capabilities.
- A live Trading 212 call. The adapter reads a recorded payload.

## Sub-features

- Holding list with name, symbol, asset type (`stock`, `etf`, `fund`, `crypto`, `cash`), state, quantity, price, cost basis, value, and gain.
- Investment platforms, so a holding knows where it is held.
- Cost basis and gain, only when both the basis and the price exist.
- Pending holdings, shown without a value.
- Portfolio total of known values, with the unknown holdings counted separately and any overflow named.
- Price history and scheduled price updates are planned. Today a holding carries its last price and the time it was priced.

## How to get to it (user POV)

Today: the investments route in the app shows the demo book. Every number on it comes from `packages/investments/src/demo.ts`, not from a database. The capabilities work through their package handlers.

Planned: the route reads `readInvestmentPortfolio` over RPC for the signed-in profile, and the same capabilities reach MCP and the CLI. The slice that adds the transport updates this page with the exact route, tool, and command.

## Driving it with the demo book

```sh
bash .claude/skills/verify-pecunia/scripts/prove-demo-book.sh --feature investments
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
2. The position on screen with quantity, price, cost basis, value, and gain, next to the row that stores them.
3. A property test for any value, rounding, or gain rule. Generate quantities and prices, include exact halves in both directions, and check that the value is an integer, that it never uses a float, and that an unknown price stays unknown.
4. A test for the null pair: a holding with no price is not zero, and a pending holding cannot carry a price.
5. A test that a conversion overflow is out of range while a missing rate is a missing rate, and that a total past the exact integer range is named.
6. A two-profile test for any store or query change: an owner of one profile sees only that profile's holdings, and cannot read or delete another profile's holding.
7. If the change adds price history or a provider, the provider port and its recorded response, plus the same value computed twice from it.

## Gotchas

- Quantity is millionths. `1500000000` is 1500 units, not 1.5 billion.
- The demo fixtures have very large gains because the prices are made up. Assert the exact demo values; do not present them as realistic returns.
- `780000000` is EUR 7,800,000.00 in minor units. Compare minor units.
- The `investments` provider account in the demo book has no bank lines; the holdings are the investment data.
- A closed position still exists. Do not filter the table by state unless the feature says so.
- Value rounding happens once, on the full quantity x price product, half away from zero. Rounding each position's unit price first changes the total.
- The package owns its contract schemas in `packages/investments/src/model.ts`. Core's model namespace exports codec handles and types, not raw schemas, so a cartridge composes its own.
- The money store filters by `profileId` on every read, write, and delete. A store that ignores it looks fine on the demo book and leaks on a real profile.
