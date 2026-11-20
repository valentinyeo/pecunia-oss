# `@pecunia/market`

One job: keep the day's exchange rates and every held position's price fresh, on a schedule, without asking the same source twice in one day.

## What it owns

- `model.ts`: the shapes the job moves. `RateRequest` asks for a base and its quotes; `RateSet` is a day of rates with the instant they were fetched; `HoldingPosition` is what a holding needs to be priced, `HoldingPrice` is the price it got. Illegal states are schema failures: a quote equal to its base, a repeated quote, a calendar date that does not exist, a rate of zero or a rate with more than twelve decimals, a negative price. A `Price` is an integer of minor units plus an ISO currency code, never a float.
- `calendar.ts`: the UTC day of an instant, and its inverse, as exact integer arithmetic. No platform `Date` sits between a stored rate's `asOf` and the instant the job ran, so a Worker's time zone cannot move a rate to another day.
- `rates.ts`: the cache rule. A day of rates is fetched once and kept: the first tick writes the day, later ticks read it back, and a tick that asks for a quote the day does not hold fetches the source and merges the missing quotes into the day it already has. Nothing overwrites an old day, and nothing deletes a quote it already stored.
- `refresh.ts`: the job every surface runs. `refreshRatesForDay` applies the cache rule, `refreshPricesForDay` prices every priceable holding, and `marketRefreshMachine` runs the two steps as one XState machine with declared Effect actors and typed failures, so a failed refresh is a named state with a `Cause`; the rate day it already wrote stays valid and cached, and the next tick picks up from it.
- `rate-source.ts` and `price-source.ts`: the two ports. A daily rates service and a price feed plug in here. `fake-sources.ts` holds the deterministic demo sources: made-up rates that move a little every day, so a demo book visibly refreshes.
- `memory.ts`: the reference `MarketStore`. It keeps days and holdings in `Ref`s, and it refuses to price a `pending` holding, because a pending holding that carries a price is not a state Pecunia allows.
- `demo.ts`: the demo book (`Example Ltd`, `Demo World ETF`, `Demo Bitcoin`, `Demo Tech Stock`) and the layers that compose the memory store with the fake sources.

The failures are part of the interface: `RateSourceUnavailable`, `PriceSourceUnavailable`, `MarketStoreUnavailable`, and `HoldingPriceRejected`, which names the holding, its currency and the currency the price arrived in. A price in the wrong currency never reaches the store.

## What it does not own yet

The D1 store over `exchange_rates` and `holdings`, and the public rates service. `packages/database` already holds both tables and the `holdings_pending_price_check` constraint this cartridge mirrors in memory. A D1 adapter implements `MarketStore` and needs no change here. The timer in `apps/sync` composes the demo layers until that adapter lands, so today a refresh is durable for the life of the Worker isolate, not across deploys.

`DateOnly`, `Rate`, `Price`, and `EpochMillis` are local stand-ins because `@pecunia/core/model` exports its types without their schemas. They carry the same rules as core's; replacing them is a one-file change in `model.ts`.

## The timer

`apps/sync/src/sync-worker.ts` registers `MARKET_CRON` at `30 5 * * *` and runs `runMarketRefresh` on every tick with the demo sources and the demo store. The job reads the day from the store before it calls a source, so a second tick on the same UTC day makes no second rates call.

## Proof

`test/rates.property.test.ts` runs 600 seeded cases over generated dates, base currencies and quote sets. Each case proves four rules over the real memory store and the real fake source: a fresh day is fetched once; the same day never calls the source again; a wider quote set on the same day fetches and merges without dropping a stored quote; and a new day leaves every earlier day untouched. It also checks the UTC day arithmetic against the platform's own ISO formatting.

`test/prices.property.test.ts` runs 500 seeded cases over generated holding currencies and amounts. A price in the holding's currency is stored as the exact integer of minor units it arrived as, and a price in any other currency is refused by name with the store left alone.

`test/demo-refresh.test.ts` runs the demo book on a real timer tick: rates and prices move from one day to the next, a second tick on the same day is cached, a pending holding is never priced, a source that does not know a quote fails the refresh without touching the day, and a price in the wrong currency fails it without touching the book.

```sh
pnpm exec vitest run packages/market/test
pnpm --filter @pecunia/market check
```
