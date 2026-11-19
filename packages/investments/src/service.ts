import type { UnknownProfile } from "@pecunia/core/settings";
import {
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
} from "effect";

import { BrokerHoldings } from "./broker.js";
import type { DuplicateHolding } from "./duplicate-holding.js";
import type { BrokerFailure } from "./holdings-sync-machine.js";
import { runHoldingsSync } from "./holdings-sync-machine.js";
import { newHoldingId } from "./ids.js";
import type { InvestmentsUnavailable } from "./investments-unavailable.js";
import {
  CostBasisChangeSchema,
  HoldingSchema,
  NameChangeSchema,
  PriceChangeSchema,
  QuantityChangeSchema,
} from "./model.js";
import type {
  BrokerHolding,
  Holding,
  HoldingId,
  HoldingPatch,
  InvestmentPlatform,
  Money,
  NewHolding,
  Portfolio,
  PriceRefreshSummary,
  ProfileId,
  SyncHoldings,
  SyncSummary,
  Timestamp,
} from "./model.js";
import { PriceBook } from "./prices.js";
import { ProfileCurrencies } from "./profile-currencies.js";
import { ExchangeRates } from "./rates.js";
import type { ReadScope, WriteScope } from "./scope.js";
import { InvestmentStore } from "./store.js";
import { UnknownHolding } from "./unknown-holding.js";
import { UnknownPlatform } from "./unknown-platform.js";
import { portfolioOf } from "./valuation.js";

const unknownHolding = (scope: WriteScope, holdingId: HoldingId) =>
  new UnknownHolding({
    holdingId,
    message: `Holding ${holdingId} is not in profile ${scope.profileId}.`,
    profileId: scope.profileId,
    repair: "Pick a holding id returned by `readInvestmentPortfolio`.",
  });

const unknownPlatform = (
  profileId: ProfileId,
  platformId: InvestmentPlatform["id"]
) =>
  new UnknownPlatform({
    message: `Platform ${platformId} is not a live investment platform.`,
    platformId,
    profileId,
    repair:
      "Add the holding to a platform returned by `readInvestmentPortfolio`, such as `manual`.",
  });

const requirePlatform = (
  profileId: ProfileId,
  platforms: readonly InvestmentPlatform[],
  platformId: InvestmentPlatform["id"]
) =>
  platforms.some((platform) => platform.id === platformId)
    ? Effect.void
    : Effect.fail(unknownPlatform(profileId, platformId));

const pricePatch = (
  holdingId: HoldingId,
  price: Money,
  pricedAt: Timestamp
): HoldingPatch => ({
  costBasis: CostBasisChangeSchema.cases.Unchanged.make({}),
  holdingId,
  name: NameChangeSchema.cases.Unchanged.make({}),
  price: PriceChangeSchema.cases.Set.make({ price, pricedAt }),
  quantity: QuantityChangeSchema.cases.Unchanged.make({}),
});

const storedHolding = (
  profileId: ProfileId,
  platformId: InvestmentPlatform["id"],
  broker: BrokerHolding,
  existing: Holding | undefined,
  millis: number
) => {
  const carriedPrice: Option.Option<Money> =
    existing === undefined ? Option.none() : existing.lastPrice;

  const carriedAt: Option.Option<Timestamp> =
    existing === undefined ? Option.none() : existing.pricedAt;

  const price = Option.isSome(broker.price) ? broker.price : carriedPrice;

  const pricedAt = Option.isSome(broker.price) ? broker.pricedAt : carriedAt;

  return Schema.decodeEffect(HoldingSchema)({
    assetType: broker.assetType,
    costBasis: Option.getOrNull(broker.costBasis),
    currency: broker.currency,
    id: newHoldingId(millis),
    lastPrice: Option.getOrNull(price),
    name: broker.name,
    openedOn: broker.openedOn,
    platformId,
    pricedAt: Option.getOrNull(pricedAt),
    profileId,
    quantity: broker.quantity,
    state: "active",
    symbol: broker.symbol,
  }).pipe(Effect.orDie);
};

export class InvestmentService extends Context.Service<
  InvestmentService,
  {
    readonly add: (
      scope: WriteScope,
      holding: NewHolding
    ) => Effect.Effect<
      Holding,
      InvestmentsUnavailable | UnknownPlatform | DuplicateHolding
    >;
    readonly edit: (
      scope: WriteScope,
      patch: HoldingPatch
    ) => Effect.Effect<Holding, InvestmentsUnavailable | UnknownHolding>;
    readonly portfolio: (
      scope: ReadScope
    ) => Effect.Effect<
      Portfolio,
      InvestmentsUnavailable | UnknownProfile | UnknownPlatform
    >;
    readonly refreshPrices: (
      scope: WriteScope
    ) => Effect.Effect<PriceRefreshSummary, InvestmentsUnavailable>;
    readonly remove: (
      scope: WriteScope,
      holdingId: HoldingId
    ) => Effect.Effect<Holding, InvestmentsUnavailable | UnknownHolding>;
    readonly sync: (
      scope: WriteScope,
      request: SyncHoldings
    ) => Effect.Effect<
      SyncSummary,
      InvestmentsUnavailable | UnknownPlatform | BrokerFailure
    >;
  }
>()("@pecunia/investments/InvestmentService", {
  make: Effect.gen(function* makeInvestmentService() {
    const store = yield* InvestmentStore;

    const profileCurrencies = yield* ProfileCurrencies;

    const exchangeRates = yield* ExchangeRates;

    const priceBook = yield* PriceBook;

    const broker = yield* BrokerHoldings;

    const portfolio = Effect.fn("InvestmentService.portfolio")(
      function* portfolio(scope: ReadScope) {
        const baseCurrency = yield* profileCurrencies.baseCurrency(
          scope.profileId
        );

        const platforms = yield* store.platforms();

        const holdings = yield* store.holdings(scope.profileId);

        for (const holding of holdings) {
          yield* requirePlatform(
            scope.profileId,
            platforms,
            holding.platformId
          );
        }

        const rates = yield* exchangeRates.read();

        return portfolioOf({
          baseCurrency,
          holdings,
          platforms,
          profileId: scope.profileId,
          rates,
        });
      }
    );

    const add = Effect.fn("InvestmentService.add")(function* add(
      scope: WriteScope,
      input: NewHolding
    ) {
      const platforms = yield* store.platforms();

      yield* requirePlatform(scope.profileId, platforms, input.platformId);

      const now = yield* DateTime.now;

      const holding = yield* Schema.decodeEffect(HoldingSchema)({
        assetType: input.assetType,
        costBasis: Option.getOrNull(input.costBasis),
        currency: input.currency,
        id: newHoldingId(DateTime.toEpochMillis(now)),
        lastPrice: Option.getOrNull(input.price),
        name: input.name,
        openedOn: input.openedOn,
        platformId: input.platformId,
        pricedAt: Option.getOrNull(input.pricedAt),
        profileId: scope.profileId,
        quantity: input.quantity,
        state: input.state,
        symbol: input.symbol,
      }).pipe(Effect.orDie);

      return yield* store.insert(scope.profileId, holding);
    });

    const edit = Effect.fn("InvestmentService.edit")(function* edit(
      scope: WriteScope,
      patch: HoldingPatch
    ) {
      const updated = yield* store.update(
        scope.profileId,
        patch.holdingId,
        patch
      );

      return yield* Effect.fromOption(updated, () =>
        unknownHolding(scope, patch.holdingId)
      );
    });

    const remove = Effect.fn("InvestmentService.remove")(function* remove(
      scope: WriteScope,
      holdingId: HoldingId
    ) {
      const removed = yield* store.remove(scope.profileId, holdingId);

      return yield* Effect.fromOption(removed, () =>
        unknownHolding(scope, holdingId)
      );
    });

    const sync = Effect.fn("InvestmentService.sync")(function* sync(
      scope: WriteScope,
      request: SyncHoldings
    ) {
      const platforms = yield* store.platforms();

      yield* requirePlatform(scope.profileId, platforms, request.platformId);

      const outcome = yield* runHoldingsSync(request.accountId).pipe(
        Effect.provideService(BrokerHoldings, broker)
      );

      if (Predicate.isTagged(outcome, "Unavailable")) {
        return yield* Effect.failCause(outcome.cause);
      }

      const now = yield* DateTime.now;

      const millis = DateTime.toEpochMillis(now);

      const existing = yield* store.holdings(scope.profileId);

      const held = new Map<string, Holding>();

      for (const holding of existing) {
        if (holding.platformId === request.platformId) {
          held.set(holding.symbol, holding);
        }
      }

      let created = 0;

      let updated = 0;

      let unpriced = 0;

      for (const holding of outcome.holdings) {
        if (Option.isNone(holding.price)) {
          unpriced += 1;
        }

        const stored = yield* storedHolding(
          scope.profileId,
          request.platformId,
          holding,
          held.get(holding.symbol),
          millis
        );

        const written = yield* store.upsert(scope.profileId, stored);

        if (written === "created") {
          created += 1;
        } else {
          updated += 1;
        }
      }

      return { created, unpriced, updated };
    });

    const refreshPrices = Effect.fn("InvestmentService.refreshPrices")(
      function* refreshPrices(scope: WriteScope) {
        const holdings = yield* store.holdings(scope.profileId);

        let priced = 0;

        let unpriced = 0;

        for (const holding of holdings) {
          if (holding.state === "pending") {
            unpriced += 1;
            continue;
          }

          const quote = yield* priceBook
            .quote(holding.symbol, holding.assetType)
            .pipe(Effect.option);

          if (Option.isNone(quote)) {
            unpriced += 1;
            continue;
          }

          yield* store.update(
            scope.profileId,
            holding.id,
            pricePatch(holding.id, quote.value.price, quote.value.asOf)
          );

          priced += 1;
        }

        return { priced, unpriced };
      }
    );

    return {
      add,
      edit,
      portfolio,
      refreshPrices,
      remove,
      sync,
    } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
