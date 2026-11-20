import { watchActor } from "@pecunia/capability/actor-watch";
import type { CurrencyCode } from "@pecunia/core/settings";
import {
  createEffectActor,
  createEffectLogic,
  join,
  setupEffect,
} from "@xstate/effect";
import { Data, Effect, Schema } from "effect";
import type { Cause } from "effect";
import { types } from "xstate";

import { asOfOf } from "./calendar.js";
import { HoldingPriceRejected } from "./holding-price-rejected.js";
import type { MarketStoreUnavailable } from "./market-store-unavailable.js";
import {
  DateOnlySchema,
  EpochMillisSchema,
  MarketRefreshRequestSchema,
} from "./model.js";
import type {
  DateOnly,
  EpochMillis,
  HoldingPrice,
  MarketRefreshRequest,
  MarketRefreshSummary,
} from "./model.js";
import { PriceSourceUnavailable } from "./price-source-unavailable.js";
import { PriceSource } from "./price-source.js";
import type { RateSourceUnavailable } from "./rate-source-unavailable.js";
import { RateSource } from "./rate-source.js";
import { coversDay, mergeQuotes } from "./rates.js";
import { MarketStore } from "./store.js";

export type MarketRefreshFailure =
  | HoldingPriceRejected
  | MarketStoreUnavailable
  | PriceSourceUnavailable
  | RateSourceUnavailable;

export interface RateDayOutcome {
  readonly cached: boolean;
  readonly quotes: number;
}

export const refreshRatesForDay = (
  request: MarketRefreshRequest
): Effect.Effect<
  RateDayOutcome,
  MarketStoreUnavailable | RateSourceUnavailable,
  MarketStore | RateSource
> =>
  Effect.gen(function* refreshDayRates() {
    const store = yield* MarketStore;
    const stored = yield* store.readRates(request.base, request.asOf);

    if (coversDay(request.quotes, stored)) {
      return { cached: true, quotes: stored.length };
    }

    const source = yield* RateSource;

    const fetched = yield* source.readRates({
      asOf: request.asOf,
      base: request.base,
      quotes: request.quotes,
    });

    const quotes = mergeQuotes(stored, fetched.quotes);

    yield* store.saveRates({
      asOf: request.asOf,
      base: request.base,
      fetchedAt: request.fetchedAt,
      quotes,
    });

    return { cached: false, quotes: quotes.length };
  });

const refreshRates = createEffectLogic({
  effect: ({ input }) => refreshRatesForDay(input),
  schemas: { input: MarketRefreshRequestSchema },
});

export const refreshPricesForDay = (input: {
  readonly asOf: DateOnly;
  readonly fetchedAt: EpochMillis;
}): Effect.Effect<
  number,
  HoldingPriceRejected | MarketStoreUnavailable | PriceSourceUnavailable,
  MarketStore | PriceSource
> =>
  Effect.gen(function* refreshDayPrices() {
    const store = yield* MarketStore;
    const positions = yield* store.listPositions();
    const [firstPosition, ...restPositions] = positions;

    if (firstPosition === undefined) {
      return 0;
    }

    const source = yield* PriceSource;

    const quotes = yield* source.readPrices({
      asOf: input.asOf,
      symbols: [
        firstPosition.symbol,
        ...restPositions.map((position) => position.symbol),
      ],
    });

    const prices: HoldingPrice[] = [];

    for (const position of positions) {
      const quote = quotes.find(
        (candidate) => candidate.symbol === position.symbol
      );

      if (quote === undefined) {
        return yield* new PriceSourceUnavailable({
          reason: `the price source returned no price for ${position.symbol}`,
        });
      }

      if (quote.price.currency !== position.currency) {
        return yield* new HoldingPriceRejected({
          holdingCurrency: position.currency,
          holdingId: position.id,
          priceCurrency: quote.price.currency,
          symbol: position.symbol,
        });
      }

      prices.push({ holdingId: position.id, price: quote.price });
    }

    yield* store.savePrices(prices, input.fetchedAt);

    return prices.length;
  });

const refreshPrices = createEffectLogic({
  effect: ({ input }) => refreshPricesForDay(input),
  schemas: {
    input: Schema.Struct({
      asOf: DateOnlySchema,
      fetchedAt: EpochMillisSchema,
    }),
  },
});

export type MarketOutcome = Data.TaggedEnum<{
  Done: { readonly summary: MarketRefreshSummary };
  Failed: { readonly cause: Cause.Cause<MarketRefreshFailure> };
}>;

export const marketOutcome = Data.taggedEnum<MarketOutcome>();

interface MarketContext {
  readonly asOf: DateOnly;
  readonly base: CurrencyCode;
  readonly cached: boolean;
  readonly fetchedAt: EpochMillis;
  readonly outcome: MarketOutcome | undefined;
  readonly priced: number;
  readonly quotes: number;
  readonly requestedQuotes: MarketRefreshRequest["quotes"];
}

const failed = (cause: Cause.Cause<MarketRefreshFailure>): MarketOutcome =>
  marketOutcome.Failed({ cause });

export const marketRefreshMachine = setupEffect({
  actors: { refreshPrices, refreshRates },
  schemas: {
    context: types<MarketContext>(),
    input: MarketRefreshRequestSchema,
  },
}).createMachine({
  context: ({ input }) => ({
    asOf: input.asOf,
    base: input.base,
    cached: false,
    fetchedAt: input.fetchedAt,
    outcome: undefined,
    priced: 0,
    quotes: 0,
    requestedQuotes: input.quotes,
  }),
  initial: "refreshingRates",
  output: ({ context }) => context.outcome,
  states: {
    done: { type: "final" },
    failed: { type: "final" },
    refreshingPrices: {
      invoke: {
        input: ({ context }) => ({
          asOf: context.asOf,
          fetchedAt: context.fetchedAt,
        }),
        onDone: {
          context: ({ context, event }) => ({
            ...context,
            outcome: marketOutcome.Done({
              summary: {
                asOf: context.asOf,
                base: context.base,
                cached: context.cached,
                priced: event.output,
                quotes: context.quotes,
              },
            }),
            priced: event.output,
          }),
          target: "done",
        },
        onError: {
          context: ({ context, event }) => ({
            ...context,
            outcome: failed(event.error.cause),
          }),
          target: "failed",
        },
        src: "refreshPrices",
      },
    },
    refreshingRates: {
      invoke: {
        input: ({ context }) => ({
          asOf: context.asOf,
          base: context.base,
          fetchedAt: context.fetchedAt,
          quotes: context.requestedQuotes,
        }),
        onDone: {
          context: ({ context, event }) => ({
            ...context,
            cached: event.output.cached,
            quotes: event.output.quotes,
          }),
          target: "refreshingPrices",
        },
        onError: {
          context: ({ context, event }) => ({
            ...context,
            outcome: failed(event.error.cause),
          }),
          target: "failed",
        },
        src: "refreshRates",
      },
    },
  },
});

export const runMarketRefresh = Effect.fn("runMarketRefresh")(
  function* runMarketRefresh(request: MarketRefreshRequest) {
    const actor = yield* createEffectActor(marketRefreshMachine, {
      input: request,
    });

    yield* watchActor("marketRefreshMachine", actor);
    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- A machine-level error or an early stop is a programming error here: the domain failure travels through the `failed` state as a Cause, not through the actor. A machine's ErrorFrom is unknown by design (statelyai/xstate#5725).
    const outcome = yield* join(actor).pipe(Effect.orDie);

    if (outcome === undefined) {
      return yield* Effect.die(
        new Error("marketRefreshMachine completed without an outcome")
      );
    }

    return yield* marketOutcome.$match(outcome, {
      Done: ({ summary }) => Effect.succeed(summary),
      Failed: ({ cause }) => Effect.failCause(cause),
    });
  },
  Effect.scoped
);

export const marketRefreshRequestOf = (input: {
  readonly base: CurrencyCode;
  readonly epochMillis: number;
  readonly quotes: MarketRefreshRequest["quotes"];
}): MarketRefreshRequest =>
  Schema.decodeSync(MarketRefreshRequestSchema)({
    asOf: asOfOf(input.epochMillis),
    base: input.base,
    fetchedAt: input.epochMillis,
    quotes: input.quotes,
  });
