import { expect, it } from "@effect/vitest";
import { CurrentPerson, PersonSchema } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { Effect, Layer, Match, Option, Schema } from "effect";

import type { BrokerHoldings } from "../src/broker.js";
import {
  addHolding,
  deleteHolding,
  readInvestmentPortfolio,
} from "../src/capabilities.js";
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
import type { InvestmentMemorySeed } from "../src/memory.js";
import {
  CostBasisChangeSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  HoldingIdSchema,
  HoldingSchema,
  MoneySchema,
  NameChangeSchema,
  PlatformIdSchema,
  PriceChangeSchema,
  ProfileIdSchema,
  QuantityChangeSchema,
  QuantitySchema,
  TimestampSchema,
} from "../src/model.js";
import type {
  Holding,
  HoldingPatch,
  HoldingValue,
  NewHolding,
  Portfolio,
  Total,
} from "../src/model.js";
import { memoryProfileCurrenciesLayer } from "../src/profile-currencies.js";
import type { ProfileCurrencyEntry } from "../src/profile-currencies.js";
import { memoryExchangeRatesLayer } from "../src/rates.js";
import {
  priceBookLayer,
  recordedCryptoQuotes,
  recordedMarketQuotes,
} from "../src/recorded-quotes.js";
import { readScopeOf, writeScopeOf } from "../src/scope.js";
import { InvestmentService } from "../src/service.js";
import { InvestmentStore } from "../src/store.js";
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

const otherProfileId = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-0002-7000-8000-000000000002"
);

const otherHoldingId = Schema.decodeSync(HoldingIdSchema)(
  "0192f0c1-0030-7000-8000-000000000001"
);

const otherOwner = Schema.decodeSync(PersonSchema)({
  email: "other-owner@example.com",
  memberships: [{ profileId: otherProfileId, role: "owner" }],
  personId: "person-other-owner",
});

const otherHolding: Holding = Schema.decodeSync(HoldingSchema)({
  assetType: "etf",
  costBasis: null,
  currency: "EUR",
  id: otherHoldingId,
  lastPrice: { currency: "EUR", minor: 780_000_000 },
  name: "Other Profile Fund",
  openedOn: "2025-06-01",
  platformId: platformId("generic-broker"),
  pricedAt,
  profileId: otherProfileId,
  quantity: 1_000_000,
  state: "active",
  symbol: "OTHER-ETF",
});

const serviceLayerOf = (
  seed: InvestmentMemorySeed,
  currencies: readonly ProfileCurrencyEntry[],
  broker: Layer.Layer<BrokerHoldings> = trading212BrokerLayer(
    demoBrokerAccountId,
    demoTrading212Payload
  ),
  market: readonly unknown[] = demoMarketQuotes,
  crypto: readonly unknown[] = demoCryptoQuotes
) => {
  const store = memoryInvestmentStoreLayer(seed);

  return Layer.merge(
    InvestmentService.layer.pipe(Layer.provide(store)),
    store
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        memoryProfileCurrenciesLayer(currencies),
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
};

const demoCurrencies: readonly ProfileCurrencyEntry[] = [
  { baseCurrency: demoBaseCurrency, profileId: demoProfileId },
];

const serviceLayer = (
  broker?: Layer.Layer<BrokerHoldings>,
  market?: readonly unknown[],
  crypto?: readonly unknown[]
) => serviceLayerOf(demoSeed, demoCurrencies, broker, market, crypto);

const twoProfileSeed: InvestmentMemorySeed = {
  holdings: [...demoSeed.holdings, otherHolding],
  platforms: demoSeed.platforms,
};

const twoProfileCurrencies: readonly ProfileCurrencyEntry[] = [
  ...demoCurrencies,
  { baseCurrency: demoBaseCurrency, profileId: otherProfileId },
];

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

const totalMinor = (total: Total): number | null =>
  Match.value(total).pipe(
    Match.tag("Known", ({ amount }) => amount.minor),
    Match.tag("Unknown", () => null),
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

      expect(totalMinor(portfolio.total)).toBe(788_640_000);

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
    Effect.gen(function* deleteAHolding() {
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
        trading === undefined ? undefined : totalMinor(trading.total)
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

it.effect("keeps each profile's holdings apart", () =>
  Effect.gen(function* profileIsolation() {
    const mine = yield* readInvestmentPortfolio.handler({
      profileId: otherProfileId,
    });

    expect(mine.profileId).toBe(otherProfileId);

    expect(
      mine.groups.flatMap((group) =>
        group.holdings.map((holding) => holding.symbol)
      )
    ).toStrictEqual(["OTHER-ETF"]);

    expect(totalMinor(mine.total)).toBe(780_000_000);

    const store = yield* InvestmentStore;

    expect(
      (yield* store.holdings(otherProfileId)).map((holding) => holding.symbol)
    ).toStrictEqual(["OTHER-ETF"]);

    expect(
      (yield* store.holdings(demoProfileId)).map((holding) => holding.symbol)
    ).toStrictEqual(["DEMO-WORLD", "DEMO-BTC", "DEMO-TECH"]);

    expect(
      Option.isNone(yield* store.remove(otherProfileId, demoPendingHoldingId))
    ).toBe(true);

    expect(
      Option.isNone(
        yield* store.update(
          otherProfileId,
          demoPendingHoldingId,
          patchOf(demoPendingHoldingId, {})
        )
      )
    ).toBe(true);

    expect(
      Option.isSome(
        yield* store.update(
          otherProfileId,
          otherHoldingId,
          patchOf(otherHoldingId, {})
        )
      )
    ).toBe(true);

    const foreignRead = yield* Effect.flip(
      readInvestmentPortfolio.handler({ profileId: demoProfileId })
    );

    expect(foreignRead._tag).toBe("Forbidden");

    const foreignDelete = yield* Effect.flip(
      deleteHolding.handler({
        holdingId: demoPendingHoldingId,
        profileId: demoProfileId,
      })
    );

    expect(foreignDelete._tag).toBe("Forbidden");

    const otherProfilesHolding = yield* Effect.flip(
      deleteHolding.handler({
        holdingId: demoPendingHoldingId,
        profileId: otherProfileId,
      })
    );

    expect(otherProfilesHolding._tag).toBe("UnknownHolding");

    const demoBook = yield* readInvestmentPortfolio
      .handler({
        profileId: demoProfileId,
      })
      .pipe(Effect.provideService(CurrentPerson, owner));

    expect(
      demoBook.groups.flatMap((group) =>
        group.holdings.map((holding) => holding.symbol)
      )
    ).toStrictEqual(["DEMO-TECH", "DEMO-WORLD", "DEMO-BTC"]);

    expect(totalMinor(demoBook.total)).toBe(788_640_000);
  }).pipe(
    Effect.provide(
      Layer.merge(
        serviceLayerOf(twoProfileSeed, twoProfileCurrencies),
        Layer.succeed(CurrentPerson, otherOwner)
      )
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
