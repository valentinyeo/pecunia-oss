import { expect, it } from "@effect/vitest";
import { CurrentPerson, PersonSchema } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { Effect, Layer, Match, Option, Schema } from "effect";

import type { BrokerHoldings } from "../src/broker.js";
import { addHolding, readInvestmentPortfolio } from "../src/capabilities.js";
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
} from "../src/demo.js";
import { memoryInvestmentStoreLayer } from "../src/memory.js";
import {
  CostBasisChangeSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  HoldingIdSchema,
  MoneySchema,
  NameChangeSchema,
  PlatformIdSchema,
  PriceChangeSchema,
  QuantityChangeSchema,
  QuantitySchema,
  TimestampSchema,
} from "../src/model.js";
import type {
  HoldingPatch,
  HoldingValue,
  NewHolding,
  Portfolio,
} from "../src/model.js";
import { memoryProfileCurrenciesLayer } from "../src/profile-currencies.js";
import { memoryExchangeRatesLayer } from "../src/rates.js";
import {
  priceBookLayer,
  recordedCryptoQuotes,
  recordedMarketQuotes,
} from "../src/recorded-quotes.js";
import { readScopeOf, writeScopeOf } from "../src/scope.js";
import { InvestmentService } from "../src/service.js";
import { trading212BrokerLayer } from "../src/trading-212.js";

const personOf = (role: "owner" | "viewer"): Person =>
  Schema.decodeSync(PersonSchema)({
    email: `demo-${role}@example.com`,
    memberships: [{ profileId: demoProfileId, role }],
    personId: `person-demo-${role}`,
  });

const owner = personOf("owner");

const viewer = personOf("viewer");

const stranger = Schema.decodeSync(PersonSchema)({
  email: "demo-stranger@example.com",
  memberships: [],
  personId: "person-demo-stranger",
});

const money = (minor: number) =>
  Schema.decodeSync(MoneySchema)({ currency: "EUR", minor });

const quantity = (value: number) => Schema.decodeSync(QuantitySchema)(value);

const platformId = (value: string) =>
  Schema.decodeSync(PlatformIdSchema)(value);

const pricedAt = Schema.decodeSync(TimestampSchema)("2026-01-05T09:00:00.000Z");

const openedOn = Schema.decodeSync(DateOnlySchema)("2025-05-01");

const demoPendingHoldingId = Schema.decodeSync(HoldingIdSchema)(
  "0192f0c1-0022-7fa5-836b-36b4f12ac1f0"
);

const missingHoldingId = Schema.decodeSync(HoldingIdSchema)(
  "0192f0c1-0040-7000-8000-00000000dead"
);

const serviceLayer = (
  broker: Layer.Layer<BrokerHoldings> = trading212BrokerLayer(
    demoBrokerAccountId,
    demoTrading212Payload
  ),
  market: readonly unknown[] = demoMarketQuotes,
  crypto: readonly unknown[] = demoCryptoQuotes
) =>
  InvestmentService.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        memoryInvestmentStoreLayer(demoSeed),
        memoryProfileCurrenciesLayer([
          { baseCurrency: demoBaseCurrency, profileId: demoProfileId },
        ]),
        memoryExchangeRatesLayer(demoRates),
        priceBookLayer.pipe(
          Layer.provide(
            Layer.merge(
              recordedMarketQuotes(market),
              recordedCryptoQuotes(crypto)
            )
          )
        ),
        broker
      )
    )
  );

const withService = <A, E>(
  effect: Effect.Effect<A, E, InvestmentService>,
  layer: Layer.Layer<InvestmentService> = serviceLayer()
) => effect.pipe(Effect.provide(layer));

const manualHolding = (symbol: string): NewHolding => ({
  assetType: "etf",
  costBasis: Option.some(money(100_000)),
  currency: demoBaseCurrency,
  name: "Demo Manual Fund",
  openedOn,
  platformId: platformId("manual"),
  price: Option.some(money(12_500)),
  pricedAt: Option.some(pricedAt),
  quantity: quantity(2_000_000),
  state: "active",
  symbol,
});

const patchOf = (
  holdingId: HoldingPatch["holdingId"],
  change: Partial<HoldingPatch>
): HoldingPatch => ({
  costBasis: CostBasisChangeSchema.cases.Unchanged.make({}),
  holdingId,
  name: NameChangeSchema.cases.Unchanged.make({}),
  price: PriceChangeSchema.cases.Unchanged.make({}),
  quantity: QuantityChangeSchema.cases.Unchanged.make({}),
  ...change,
});

const amountOf = (value: HoldingValue): number | null =>
  Match.value(value).pipe(
    Match.tag("Known", ({ amount }) => amount.minor),
    Match.tag("Unknown", () => null),
    Match.exhaustive
  );

const gainAmountOf = (value: HoldingValue): number | null =>
  Match.value(value).pipe(
    Match.tag("Known", ({ gain }) =>
      Match.value(gain).pipe(
        Match.tag("Known", ({ amount }) => amount.minor),
        Match.tag("Unknown", () => null),
        Match.exhaustive
      )
    ),
    Match.tag("Unknown", () => null),
    Match.exhaustive
  );

const reasonOf = (value: HoldingValue): string =>
  Match.value(value).pipe(
    Match.tag("Known", () => "known"),
    Match.tag("Unknown", ({ reason }) => reason),
    Match.exhaustive
  );

const viewOf = (portfolio: Portfolio, symbol: string) => {
  const found = portfolio.groups
    .flatMap((group) => group.holdings)
    .find((holding) => holding.symbol === symbol);

  if (found === undefined) {
    throw new Error(`Portfolio has no ${symbol}`);
  }

  return found;
};

it.effect("groups the demo book by platform with totals", () =>
  withService(
    Effect.gen(function* demoPortfolio() {
      const readScope = yield* readScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      const portfolio = yield* service.portfolio(readScope);

      expect(portfolio.valuedCount).toBe(2);

      expect(portfolio.unknownCount).toBe(1);

      expect(Option.getOrNull(portfolio.total)?.minor).toBe(788_640_000);

      const bitcoin = viewOf(portfolio, "DEMO-BTC");

      expect(amountOf(bitcoin.value)).toBe(8_640_000);
    })
  )
);

it.effect("adds a manual holding and shows its value", () =>
  withService(
    Effect.gen(function* addManualHolding() {
      const scope = yield* writeScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      const added = yield* service.add(scope, manualHolding("DEMO-MANUAL"));

      expect(added.symbol).toBe("DEMO-MANUAL");

      const readScope = yield* readScopeOf(owner, demoProfileId);

      const portfolio = yield* service.portfolio(readScope);

      const shown = viewOf(portfolio, "DEMO-MANUAL");

      expect(amountOf(shown.value)).toBe(25_000);

      expect(gainAmountOf(shown.value)).toBe(-75_000);
    })
  )
);

it.effect("shows an added holding with no price as unknown", () =>
  withService(
    Effect.gen(function* addUnpricedHolding() {
      const scope = yield* writeScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      yield* service.add(scope, {
        ...manualHolding("DEMO-NO-PRICE"),
        costBasis: Option.none(),
        price: Option.none(),
        pricedAt: Option.none(),
      });

      const readScope = yield* readScopeOf(owner, demoProfileId);

      const portfolio = yield* service.portfolio(readScope);

      const shown = viewOf(portfolio, "DEMO-NO-PRICE");

      expect(Option.isNone(shown.price)).toBe(true);

      expect(reasonOf(shown.value)).toBe("no-price");

      expect(portfolio.unknownCount).toBe(2);
    })
  )
);

it.effect("edits quantity, price and cost basis through explicit changes", () =>
  withService(
    Effect.gen(function* editHolding() {
      const scope = yield* writeScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      const added = yield* service.add(scope, manualHolding("DEMO-EDIT"));

      const doubled = yield* service.edit(
        scope,
        patchOf(added.id, {
          quantity: QuantityChangeSchema.cases.Set.make({
            quantity: quantity(4_000_000),
          }),
        })
      );

      expect(doubled.quantity).toBe(4_000_000);

      const cleared = yield* service.edit(
        scope,
        patchOf(added.id, {
          price: PriceChangeSchema.cases.Cleared.make({}),
        })
      );

      expect(Option.isNone(cleared.lastPrice)).toBe(true);

      const readScope = yield* readScopeOf(owner, demoProfileId);

      const portfolio = yield* service.portfolio(readScope);

      expect(reasonOf(viewOf(portfolio, "DEMO-EDIT").value)).toBe("no-price");
    })
  )
);

it.effect("prices a pending holding into an active one", () =>
  withService(
    Effect.gen(function* pricePendingHolding() {
      const scope = yield* writeScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      const priced = yield* service.edit(
        scope,
        patchOf(demoPendingHoldingId, {
          price: PriceChangeSchema.cases.Set.make({
            price: money(310_000),
            pricedAt,
          }),
        })
      );

      expect(priced.state).toBe("active");

      expect(Option.isSome(priced.lastPrice)).toBe(true);
    })
  )
);

it.effect("deletes a holding and stops listing it", () =>
  withService(
    Effect.gen(function* deleteHolding() {
      const scope = yield* writeScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      const added = yield* service.add(scope, manualHolding("DEMO-DELETE"));

      const removed = yield* service.remove(scope, added.id);

      expect(removed.id).toBe(added.id);

      const readScope = yield* readScopeOf(owner, demoProfileId);

      const portfolio = yield* service.portfolio(readScope);

      expect(
        portfolio.groups
          .flatMap((group) => group.holdings)
          .some((holding) => holding.holdingId === added.id)
      ).toBe(false);
    })
  )
);

it.effect(
  "refuses a duplicate symbol, an unknown platform and an unknown holding",
  () =>
    withService(
      Effect.gen(function* refuseWrites() {
        const scope = yield* writeScopeOf(owner, demoProfileId);

        const service = yield* InvestmentService;

        const added = yield* service.add(
          scope,
          manualHolding("DEMO-DUPLICATE")
        );

        const duplicate = yield* Effect.flip(
          service.add(scope, manualHolding("DEMO-DUPLICATE"))
        );

        expect(duplicate._tag).toBe("DuplicateHolding");

        const missingPlatform = yield* Effect.flip(
          service.add(scope, {
            ...manualHolding("DEMO-ELSEWHERE"),
            platformId: platformId("platform-not-installed"),
          })
        );

        expect(missingPlatform._tag).toBe("UnknownPlatform");

        const missingHolding = yield* Effect.flip(
          service.remove(scope, missingHoldingId)
        );

        expect(missingHolding._tag).toBe("UnknownHolding");

        expect(added.symbol).toBe("DEMO-DUPLICATE");
      })
    )
);

it.effect("syncs holdings from the broker and keeps them on a second run", () =>
  withService(
    Effect.gen(function* syncBrokerHoldings() {
      const scope = yield* writeScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      const first = yield* service.sync(scope, {
        accountId: demoBrokerAccountId,
        platformId: demoTrading212PlatformId,
      });

      expect(first).toEqual({ created: 3, unpriced: 1, updated: 0 });

      const second = yield* service.sync(scope, {
        accountId: demoBrokerAccountId,
        platformId: demoTrading212PlatformId,
      });

      expect(second).toEqual({ created: 0, unpriced: 1, updated: 3 });

      const readScope = yield* readScopeOf(owner, demoProfileId);

      const portfolio = yield* service.portfolio(readScope);

      const trading = portfolio.groups.find(
        (group) => group.platform.id === demoTrading212PlatformId
      );

      expect(trading?.holdings).toHaveLength(3);

      expect(
        trading === undefined
          ? undefined
          : Option.getOrNull(trading.total)?.minor
      ).toBe(788_640_000);

      expect(viewOf(portfolio, "DEMO-WORLD").quantity).toBe(1_500_000_000);
    })
  )
);

it.effect("fails the sync by name when the broker payload is wrong", () =>
  withService(
    Effect.gen(function* rejectBadPayload() {
      const scope = yield* writeScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      const failure = yield* Effect.flip(
        service.sync(scope, {
          accountId: demoBrokerAccountId,
          platformId: demoTrading212PlatformId,
        })
      );

      expect(failure._tag).toBe("BrokerPayloadRejected");
    }),
    serviceLayer(trading212BrokerLayer(demoBrokerAccountId, { instruments: 1 }))
  )
);

it.effect(
  "prices shares from the market source and crypto from the second source",
  () =>
    withService(
      Effect.gen(function* refreshPrices() {
        const scope = yield* writeScopeOf(owner, demoProfileId);

        const service = yield* InvestmentService;

        const summary = yield* service.refreshPrices(scope);

        expect(summary).toEqual({ priced: 2, unpriced: 1 });
      })
    )
);

it.effect("leaves crypto unpriced when only the market source answers", () =>
  withService(
    Effect.gen(function* refreshPrices() {
      const scope = yield* writeScopeOf(owner, demoProfileId);

      const service = yield* InvestmentService;

      const summary = yield* service.refreshPrices(scope);

      expect(summary).toEqual({ priced: 1, unpriced: 2 });
    }),
    serviceLayer(
      trading212BrokerLayer(demoBrokerAccountId, demoTrading212Payload),
      demoMarketQuotes,
      []
    )
  )
);

it.effect("lets a viewer read and refuses a viewer's write", () =>
  Effect.gen(function* viewerAccess() {
    const read = yield* readInvestmentPortfolio.handler({
      profileId: demoProfileId,
    });

    expect(read.baseCurrency).toBe("EUR");

    const write = yield* Effect.flip(
      addHolding.handler({
        ...manualHolding("DEMO-VIEWER"),
        costBasis: Option.some(money(1000)),
        price: Option.some(money(1000)),
        pricedAt: Option.some(pricedAt),
        profileId: demoProfileId,
      })
    );

    expect(write._tag).toBe("Forbidden");
  }).pipe(
    Effect.provide(
      Layer.merge(serviceLayer(), Layer.succeed(CurrentPerson, viewer))
    )
  )
);

it.effect("refuses a stranger's read", () =>
  Effect.gen(function* strangerAccess() {
    const failure = yield* Effect.flip(
      readInvestmentPortfolio.handler({ profileId: demoProfileId })
    );

    expect(failure._tag).toBe("Forbidden");
  }).pipe(
    Effect.provide(
      Layer.merge(serviceLayer(), Layer.succeed(CurrentPerson, stranger))
    )
  )
);

it("parses a money value exactly as integer minor units", () => {
  expect(money(1).minor).toBe(1);

  expect(Schema.decodeSync(CurrencyCodeSchema)("EUR")).toBe("EUR");

  expect(
    Schema.decodeOption(MoneySchema)({ currency: "EUR", minor: 1.5 })._tag
  ).toBe("None");
});
