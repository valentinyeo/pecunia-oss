#!/usr/bin/env node
import { Effect, Layer, Option, Predicate, Schema } from "effect";

import {
  CurrentPerson,
  PersonSchema,
} from "../../../../packages/access/dist/index.js";
import {
  addHolding,
  deleteHolding,
  editHolding,
  readInvestmentPortfolio,
  refreshInvestmentPrices,
  syncInvestmentHoldings,
} from "../../../../packages/investments/dist/capabilities.js";
import {
  demoBaseCurrency,
  demoBrokerAccountId,
  demoCryptoQuotes,
  demoMarketQuotes,
  demoProfileId,
  demoRates,
  demoSeed,
  demoTrading212Payload,
  demoTrading212PlatformId,
} from "../../../../packages/investments/dist/demo.js";
import { memoryInvestmentStoreLayer } from "../../../../packages/investments/dist/memory.js";
import {
  AddHoldingRequestSchema,
  CostBasisChangeSchema,
  NameChangeSchema,
  PriceChangeSchema,
  QuantityChangeSchema,
} from "../../../../packages/investments/dist/model.js";
import { memoryProfileCurrenciesLayer } from "../../../../packages/investments/dist/profile-currencies.js";
import { memoryExchangeRatesLayer } from "../../../../packages/investments/dist/rates.js";
import {
  priceBookLayer,
  recordedCryptoQuotes,
  recordedMarketQuotes,
} from "../../../../packages/investments/dist/recorded-quotes.js";
import { InvestmentService } from "../../../../packages/investments/dist/service.js";
import { InvestmentStore } from "../../../../packages/investments/dist/store.js";
import { trading212BrokerLayer } from "../../../../packages/investments/dist/trading-212.js";
import { countingLayer, mutationRecorder } from "./lib/mutating-adapter.mjs";
import { observe } from "./lib/observation.mjs";

const recorder = mutationRecorder();

const store = countingLayer({
  layer: memoryInvestmentStoreLayer(demoSeed),
  mutations: ["insert", "update", "remove", "upsert"],
  recorder,
  service: InvestmentStore,
});

const person = Schema.decodeSync(PersonSchema)({
  email: "demo@example.com",
  memberships: [{ profileId: demoProfileId, role: "owner" }],
  personId: "person-demo",
});

const world = Layer.mergeAll(
  InvestmentService.layer.pipe(Layer.provide(store)),
  Layer.succeed(CurrentPerson, person)
).pipe(
  Layer.provide(
    Layer.mergeAll(
      memoryProfileCurrenciesLayer([
        { baseCurrency: demoBaseCurrency, profileId: demoProfileId },
      ]),
      memoryExchangeRatesLayer(demoRates),
      trading212BrokerLayer(demoBrokerAccountId, demoTrading212Payload),
      priceBookLayer.pipe(
        Layer.provide(
          Layer.mergeAll(
            recordedMarketQuotes(demoMarketQuotes),
            recordedCryptoQuotes(
              demoCryptoQuotes.map((quote) => ({ ...quote, price: "7300.00" }))
            )
          )
        )
      )
    )
  )
);

const request = { profileId: demoProfileId };

const rowsOf = (portfolio) =>
  portfolio.groups.flatMap((group) => group.holdings);

const totalText = (portfolio) =>
  `total=${Predicate.isTagged(portfolio.total, "Known") ? portfolio.total.amount.minor : portfolio.total.reason} valued=${portfolio.valuedCount} unknown=${portfolio.unknownCount}`;

const valueText = (row) =>
  Predicate.isTagged(row.value, "Known")
    ? `${row.value.amount.minor} gain=${Predicate.isTagged(row.value.gain, "Known") ? row.value.gain.amount.minor : row.value.gain.reason}`
    : row.value.reason;

const portfolioRecords = (portfolio) =>
  rowsOf(portfolio).map((row) => ({
    gainMinor:
      Predicate.isTagged(row.value, "Known") &&
      Predicate.isTagged(row.value.gain, "Known")
        ? row.value.gain.amount.minor
        : null,
    id: `${row.platformId}:${row.symbol}`,
    name: row.name,
    platformId: row.platformId,
    portfolioTotalMinor: Predicate.isTagged(portfolio.total, "Known")
      ? portfolio.total.amount.minor
      : null,
    priceMinor: Option.getOrNull(row.price)?.minor ?? null,
    profileId: demoProfileId,
    quantity: row.quantity,
    symbol: row.symbol,
    unknownCount: portfolio.unknownCount,
    valueMinor: Predicate.isTagged(row.value, "Known")
      ? row.value.amount.minor
      : null,
    valuedCount: portfolio.valuedCount,
  }));

const observations = await Effect.runPromise(
  Effect.gen(function* driveInvestments() {
    const before = yield* readInvestmentPortfolio.handler(request);

    const emitted = [
      observe({
        id: "investments-capability-values-demo",
        value: `${totalText(before)} ${rowsOf(before)
          .map((row) => `${row.name}=${valueText(row)}`)
          .toSorted()
          .join(",")}`,
      }),
    ];

    const added = yield* addHolding.handler(
      Schema.decodeSync(AddHoldingRequestSchema)({
        assetType: "stock",
        costBasis: { currency: "EUR", minor: 200 },
        currency: "EUR",
        name: "Demo Verify Stock",
        openedOn: "2026-01-05",
        platformId: "manual",
        price: { currency: "EUR", minor: 150 },
        pricedAt: "2026-01-05T09:00:00.000Z",
        profileId: demoProfileId,
        quantity: 2_000_000,
        state: "active",
        symbol: "DEMO-VERIFY",
      })
    );

    emitted.push(
      observe({
        id: "investments-capability-adds-holding",
        value: `symbol=${added.symbol} quantity=${added.quantity}`,
      })
    );

    const afterAdd = yield* readInvestmentPortfolio.handler(request);

    emitted.push(
      observe({
        id: "investments-add-reads-back",
        operation: "readInvestmentPortfolio",
        value: portfolioRecords(afterAdd),
      })
    );

    const edited = yield* editHolding.handler({
      ...request,
      costBasis: CostBasisChangeSchema.cases.Unchanged.make({}),
      holdingId: added.id,
      name: NameChangeSchema.cases.Set.make({ name: "Demo Renamed Stock" }),
      price: PriceChangeSchema.cases.Set.make({
        price: { currency: "EUR", minor: 200 },
        pricedAt: "2026-01-06T09:00:00.000Z",
      }),
      quantity: QuantityChangeSchema.cases.Set.make({ quantity: 3_000_000 }),
    });

    emitted.push(
      observe({
        id: "investments-capability-edits-holding",
        value: `${edited.name} quantity=${edited.quantity} price=${Option.getOrNull(edited.lastPrice)?.minor}`,
      })
    );

    const afterEdit = yield* readInvestmentPortfolio.handler(request);

    emitted.push(
      observe({
        id: "investments-edit-reads-back",
        operation: "readInvestmentPortfolio",
        value: portfolioRecords(afterEdit),
      })
    );

    const deleted = yield* deleteHolding.handler({
      ...request,
      holdingId: added.id,
    });

    emitted.push(
      observe({
        id: "investments-capability-deletes-holding",
        value: deleted.symbol,
      })
    );

    const afterDelete = yield* readInvestmentPortfolio.handler(request);

    emitted.push(
      observe({
        id: "investments-delete-reads-back",
        operation: "readInvestmentPortfolio",
        value: portfolioRecords(afterDelete),
      })
    );

    const synced = yield* syncInvestmentHoldings.handler({
      ...request,
      accountId: demoBrokerAccountId,
      platformId: demoTrading212PlatformId,
    });

    emitted.push(
      observe({
        id: "investments-capability-syncs-broker",
        value: `created=${synced.created} updated=${synced.updated} unpriced=${synced.unpriced}`,
      })
    );

    const afterSync = yield* readInvestmentPortfolio.handler(request);

    emitted.push(
      observe({
        id: "investments-sync-reads-back",
        operation: "readInvestmentPortfolio",
        value: portfolioRecords(afterSync),
      })
    );

    const refreshed = yield* refreshInvestmentPrices.handler(request);

    emitted.push(
      observe({
        id: "investments-capability-refreshes-prices",
        value: `priced=${refreshed.priced} unpriced=${refreshed.unpriced}`,
      })
    );

    const afterRefresh = yield* readInvestmentPortfolio.handler(request);

    emitted.push(
      observe({
        id: "investments-refresh-reads-back",
        operation: "readInvestmentPortfolio",
        value: portfolioRecords(afterRefresh),
      })
    );

    return emitted;
  }).pipe(Effect.provide(world))
);

process.stdout.write(
  `${JSON.stringify({ observations, mutatingCalls: recorder.total() }, null, 2)}\n`
);
