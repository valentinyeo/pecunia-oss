import { watchActor } from "@pecunia/capability/actor-watch";
import {
  createEffectActor,
  createEffectLogic,
  join,
  setupEffect,
} from "@xstate/effect";
import { Data, Effect, Schema } from "effect";
import type { Cause } from "effect";
import { types } from "xstate";

import type { BrokerPayloadRejected } from "./broker-payload-rejected.js";
import type { BrokerUnavailable } from "./broker-unavailable.js";
import { BrokerHoldings } from "./broker.js";
import { BrokerAccountIdSchema } from "./model.js";
import type { BrokerAccountId, BrokerHolding } from "./model.js";

export type BrokerFailure = BrokerUnavailable | BrokerPayloadRejected;

export type HoldingsSyncOutcome = Data.TaggedEnum<{
  Fetched: { readonly holdings: readonly BrokerHolding[] };
  Unavailable: { readonly cause: Cause.Cause<BrokerFailure> };
}>;

export const holdingsSyncOutcome = Data.taggedEnum<HoldingsSyncOutcome>();

interface HoldingsSyncContext {
  readonly accountId: BrokerAccountId;
  readonly outcome: HoldingsSyncOutcome | undefined;
}

const fetchBrokerHoldings = createEffectLogic({
  effect: ({ input }) =>
    BrokerHoldings.use((broker) => broker.fetch(input.accountId)),
  schemas: { input: Schema.Struct({ accountId: BrokerAccountIdSchema }) },
});

export const holdingsSyncMachine = setupEffect({
  actors: { fetchBrokerHoldings },
  schemas: {
    context: types<HoldingsSyncContext>(),
    input: Schema.Struct({ accountId: BrokerAccountIdSchema }),
  },
}).createMachine({
  context: ({ input }) => ({ accountId: input.accountId, outcome: undefined }),
  initial: "fetching",
  output: ({ context }) => context.outcome,
  states: {
    fetched: { type: "final" },
    fetching: {
      invoke: {
        input: ({ context }) => ({ accountId: context.accountId }),
        onDone: {
          context: ({ context, event }) => ({
            ...context,
            outcome: holdingsSyncOutcome.Fetched({
              holdings: event.output,
            }),
          }),
          target: "fetched",
        },
        onError: {
          context: ({ context, event }) => ({
            ...context,
            outcome: holdingsSyncOutcome.Unavailable({
              cause: event.error.cause,
            }),
          }),
          target: "unavailable",
        },
        src: "fetchBrokerHoldings",
      },
    },
    unavailable: { type: "final" },
  },
});

export const runHoldingsSync = Effect.fn("runHoldingsSync")(
  function* runHoldingsSync(accountId: BrokerAccountId) {
    const actor = yield* createEffectActor(holdingsSyncMachine, {
      input: { accountId },
    });

    yield* watchActor("holdingsSyncMachine", actor);

    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- A machine-level error or an early stop is a programming error here: the domain failure travels through the `unavailable` state, not the actor. A machine's ErrorFrom is unknown by design (statelyai/xstate#5725), so the unknown-error diagnostic is off for this one call and orDie closes it.
    const outcome = yield* join(actor).pipe(Effect.orDie);

    if (outcome === undefined) {
      return yield* Effect.die(
        new Error("holdingsSyncMachine completed without an outcome")
      );
    }

    return outcome;
  },
  Effect.scoped
);
