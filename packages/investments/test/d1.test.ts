import { describe, expect, it } from "@effect/vitest";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { Effect, Layer, Option, Predicate, Schema } from "effect";

import { BrokerUnavailable } from "../src/broker-unavailable.js";
import { BrokerHoldings } from "../src/broker.js";
import { d1InvestmentsLayer } from "../src/d1.js";
import {
  CostBasisChangeSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  MinorUnitsSchema,
  MoneySchema,
  NameChangeSchema,
  PlatformIdSchema,
  PriceChangeSchema,
  ProfileIdSchema,
  QuantityChangeSchema,
  QuantitySchema,
  TimestampSchema,
} from "../src/model.js";
import {
  priceBookLayer,
  recordedCryptoQuotes,
  recordedMarketQuotes,
} from "../src/recorded-quotes.js";
import { ReadScopeSchema, WriteScopeSchema } from "../src/scope.js";
import { InvestmentService } from "../src/service.js";

const EXAMPLE_LTD_ID = "0192f0c1-0001-702d-8484-48490b729601";

const unavailableBrokerLayer = Layer.succeed(BrokerHoldings, {
  fetch: (accountId) =>
    Effect.fail(
      new BrokerUnavailable({
        accountId,
        message: "No broker transport configured in D1 unit test.",
        repair: "Provide a recorded or live broker layer.",
      })
    ),
});

const liveInvestmentLayer = () =>
  InvestmentService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        d1InvestmentsLayer.pipe(Layer.provide(openDemoSqliteLayer())),
        priceBookLayer.pipe(
          Layer.provide(
            Layer.mergeAll(recordedMarketQuotes([]), recordedCryptoQuotes([]))
          )
        ),
        unavailableBrokerLayer
      )
    )
  );

describe("@pecunia/investments/d1", () => {
  it.effect(
    "reads seeded demo holdings from migrated D1 SQLite with exact valuation and unpriced count",
    () =>
      Effect.gen(function* testPortfolioRead() {
        const profileId =
          yield* Schema.decodeEffect(ProfileIdSchema)(EXAMPLE_LTD_ID);

        const scope = yield* Schema.decodeEffect(ReadScopeSchema)({
          access: "read",
          profileId,
        });

        const service = yield* InvestmentService;

        const portfolio = yield* service.portfolio(scope);

        expect(portfolio.baseCurrency).toBe("EUR");
        expect(portfolio.valuedCount).toBe(2);
        expect(portfolio.unknownCount).toBe(1);
        expect(Predicate.isTagged(portfolio.total, "Known")).toBe(true);

        const symbols = portfolio.groups.flatMap((group) =>
          group.holdings.map((holding) => holding.symbol)
        );

        expect(symbols).toContain("DEMO-WORLD");
        expect(symbols).toContain("DEMO-BTC");
        expect(symbols).toContain("DEMO-TECH");
      }).pipe(Effect.provide(liveInvestmentLayer()))
  );

  it.effect(
    "adds, edits, and removes a manual holding persisted in D1 SQLite",
    () =>
      Effect.gen(function* testHoldingCrud() {
        const profileId =
          yield* Schema.decodeEffect(ProfileIdSchema)(EXAMPLE_LTD_ID);

        const readScope = yield* Schema.decodeEffect(ReadScopeSchema)({
          access: "read",
          profileId,
        });

        const writeScope = yield* Schema.decodeEffect(WriteScopeSchema)({
          access: "write",
          profileId,
        });

        const currency = yield* Schema.decodeEffect(CurrencyCodeSchema)("EUR");

        const platformId =
          yield* Schema.decodeEffect(PlatformIdSchema)("manual");

        const openedOn =
          yield* Schema.decodeEffect(DateOnlySchema)("2025-11-01");

        const quantity = yield* Schema.decodeEffect(QuantitySchema)(2_000_000);

        const price = yield* Schema.decodeEffect(MoneySchema)({
          currency,
          minor: yield* Schema.decodeEffect(MinorUnitsSchema)(10_000),
        });

        const pricedAt = yield* Schema.decodeEffect(TimestampSchema)(
          "2025-12-01T12:00:00.000Z"
        );

        const service = yield* InvestmentService;

        const added = yield* service.add(writeScope, {
          assetType: "etf",
          costBasis: Option.none(),
          currency,
          name: "Demo Bond ETF",
          openedOn,
          platformId,
          price: Option.some(price),
          pricedAt: Option.some(pricedAt),
          quantity,
          state: "active",
          symbol: "DEMO-BOND",
        });

        expect(added.symbol).toBe("DEMO-BOND");

        const edited = yield* service.edit(writeScope, {
          costBasis: CostBasisChangeSchema.cases.Unchanged.make({}),
          holdingId: added.id,
          name: NameChangeSchema.cases.Set.make({
            name: "Demo Euro Bond ETF",
          }),
          price: PriceChangeSchema.cases.Unchanged.make({}),
          quantity: QuantityChangeSchema.cases.Set.make({
            quantity: yield* Schema.decodeEffect(QuantitySchema)(3_000_000),
          }),
        });

        expect(edited.name).toBe("Demo Euro Bond ETF");
        expect(edited.quantity).toBe(3_000_000);

        const duplicateFailure = yield* service
          .add(writeScope, {
            assetType: "etf",
            costBasis: Option.none(),
            currency,
            name: "Duplicate",
            openedOn,
            platformId,
            price: Option.none(),
            pricedAt: Option.none(),
            quantity,
            state: "active",
            symbol: "DEMO-BOND",
          })
          .pipe(Effect.flip);

        expect(duplicateFailure._tag).toBe("DuplicateHolding");

        const removed = yield* service.remove(writeScope, added.id);

        expect(removed.id).toBe(added.id);

        const afterRemove = yield* service.portfolio(readScope);

        const remainingSymbols = afterRemove.groups.flatMap((group) =>
          group.holdings.map((holding) => holding.symbol)
        );

        expect(remainingSymbols).not.toContain("DEMO-BOND");
      }).pipe(Effect.provide(liveInvestmentLayer()))
  );
});
