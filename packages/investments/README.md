# `@pecunia/investments`

Holdings, prices and value in one currency. One cartridge for the brokerage position a person adds by hand or a broker sync brings in.

## What it owns

- `model.ts`: the portfolio view, holding edits and sync requests, layered on the sealed `Holding`, `InvestmentPlatform`, `Money` and `Quantity` schemas in `@pecunia/core/model`. A holding's value is a tagged union: `Known` carries an amount and a gain, `Unknown` carries a reason (`no-price`, `no-rate`, `out-of-range`). Unknown is never zero, and a union member never carries a sibling member's fields.
- `valuation.ts`: the one place that turns quantity, price, cost basis and rates into a value. Quantity is millionths of a unit, price and cost basis are integer minor units, and the product is computed in `BigInt`, rounded once, then checked against the safe integer range. A missing price stays unknown. A missing rate stays unknown. A portfolio total adds only the known values and counts the rest.
- `decimal.ts`: exact decimal text to units and minor units. Trading 212 sends quantities and prices as decimals; this module converts them with `BigInt` and refuses a fraction the unit cannot hold, so no float ever reaches a position.
- `scope.ts`, `service.ts`, `contracts.ts`, `capabilities.ts`: six capabilities — `readInvestmentPortfolio`, `addHolding`, `editHolding`, `deleteHolding`, `syncInvestmentHoldings`, `refreshInvestmentPrices` — behind the same `authorize` scopes as the rest of the app. A viewer reads and cannot write. Edits are explicit patches, so leaving a field alone, clearing it and setting it are three different values. Pricing a pending holding marks it active.
- `broker.ts` and `trading-212.ts`: the broker port and the first adapter. Trading 212's recorded API payload is parsed at the boundary; a quantity or price that would need a float is refused by name, field by field. A sync keeps the last known price when the broker returns no quote.
- `prices.ts`, `market-quotes.ts`, `crypto-quotes.ts` and `recorded-quotes.ts`: one market source for shares, ETFs, funds, cash and anything that is not crypto, and a second source for crypto. `PriceBook` routes by asset type, so a share never asks the crypto source and a crypto symbol never asks the market source. A symbol with no quote stays unpriced and is counted.
- `holdings-sync-machine.ts`: the broker holdings job as an XState machine started with `createEffectActor`. The broker call is a declared `createEffectLogic` actor, and its failure travels as an `EffectFailure` cause.
- `memory.ts` and `demo.ts`: the reference `InvestmentStore` and the made-up demo book for `Example Ltd`. The demo values match the D1 demo seed: `Demo World ETF` at 1,500 units and 520,000 EUR minor units, `Demo Bitcoin` at 12 units and 720,000, and `Demo Tech Stock` pending with no price.

## What it does not own yet

The store is in memory. A D1 adapter over `holdings` and `investment_platforms` is the next slice: `InvestmentStore` is the port it plugs into, and `@pecunia/core/model` already carries the sealed `Holding` and `InvestmentPlatform` shapes.

The scheduled handoff is not wired. `apps/sync` registers `SYNC_CRON` and `MARKET_CRON`, but the Worker does not yet call `syncInvestmentHoldings` or `refreshInvestmentPrices` over its service binding. The capabilities are ready for that caller.

The web screen reads `demoPortfolio`, the same way the dashboard reads its demo data. RPC composition for investments lands with the D1 store and the signed-in profile.

## Proof

```sh
pnpm --filter @pecunia/investments build
cd packages/investments && pnpm exec vitest run
pnpm exec oxlint packages/investments
pnpm exec oxfmt --check packages/investments
pnpm --filter @pecunia/investments check
```

`test/valuation.property.test.ts` runs 600 seeded cases over quantities, prices and cost bases, and compares every known value against an independent `BigInt` reference. It proves the value is an integer, that a missing price stays unknown, that a gain needs both a price and a cost basis, and that a total adds only known values. `test/price-routing.property.test.ts` runs 500 seeded cases over asset types and proves the market and crypto sources never stand in for each other. `test/decimal.property.test.ts` runs 500 seeded cases over decimal text. `test/demo.test.ts` pins the demo book: 788,640,000 EUR minor units valued, one holding unknown. `test/service.test.ts` drives the six capabilities through the real memory adapter, including viewer refusal, duplicate symbols, unknown platforms, a broker sync that creates then updates, and a price refresh that leaves crypto unpriced when only the market source answers. `test/trading-212.test.ts` parses the recorded broker payload and refuses a fractional quantity, an over-precise price and a bad currency by field. `test/contracts.test.ts` proves the wire boundary and the RPC projection.
