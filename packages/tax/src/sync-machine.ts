import { watchActor } from "@pecunia/capability/actor-watch";
import type { ProfileId, TaxProfileId } from "@pecunia/core/model";
import {
  createEffectActor,
  createEffectLogic,
  join,
  setupEffect,
} from "@xstate/effect";
import { Data, Effect, Schema } from "effect";
import type { Cause } from "effect";
import { types } from "xstate";

import {
  DueDeclarationSchema,
  ProfileIdSchema,
  ReportedKindsSchema,
  SyncTaxDuesRequestSchema,
  TaxProfileIdSchema,
} from "./model.js";
import type {
  DueDeclaration,
  ReportedKinds,
  SyncReceipt,
  SyncTaxDuesRequest,
} from "./model.js";
import { TaxDueStore } from "./store.js";
import type { TaxBooksUnavailable } from "./tax-books-unavailable.js";
import { TaxBooks } from "./tax-books.js";
import type { TaxDuesRejected } from "./tax-due-rejected.js";
import type { TaxDueStoreError } from "./tax-due-store-error.js";
import type { UnknownTaxProfile } from "./unknown-tax-profile.js";

export type SyncFailure =
  | TaxBooksUnavailable
  | TaxDueStoreError
  | TaxDuesRejected
  | UnknownTaxProfile;

export type SyncOutcome = Data.TaggedEnum<{
  Done: { readonly receipt: SyncReceipt };
  Failed: { readonly cause: Cause.Cause<SyncFailure> };
}>;

export const syncOutcome = Data.taggedEnum<SyncOutcome>();

interface SyncContext {
  readonly declarations: readonly DueDeclaration[];
  readonly outcome: SyncOutcome | undefined;
  readonly profileId: ProfileId;
  readonly reportedKinds: ReportedKinds;
  readonly taxProfileId: TaxProfileId;
}

const failed = (cause: Cause.Cause<SyncFailure>): SyncOutcome =>
  syncOutcome.Failed({ cause });

const fetchDues = createEffectLogic({
  effect: ({ input }) => TaxBooks.use((books) => books.fetchDues(input)),
  schemas: { input: SyncTaxDuesRequestSchema },
});

const recordDues = createEffectLogic({
  effect: ({ input }) => TaxDueStore.use((store) => store.replace(input)),
  schemas: {
    input: Schema.Struct({
      declarations: Schema.Array(DueDeclarationSchema),
      profileId: ProfileIdSchema,
      reportedKinds: ReportedKindsSchema,
      taxProfileId: TaxProfileIdSchema,
    }),
  },
});

export const syncTaxDuesMachine = setupEffect({
  actors: { fetchDues, recordDues },
  schemas: {
    context: types<SyncContext>(),
    input: SyncTaxDuesRequestSchema,
  },
}).createMachine({
  context: ({ input }) => ({
    ...input,
    declarations: [],
    outcome: undefined,
    reportedKinds: [],
  }),
  initial: "fetching",
  output: ({ context }) => context.outcome,
  states: {
    done: { type: "final" },
    failed: { type: "final" },
    fetching: {
      invoke: {
        input: ({ context }) => ({
          profileId: context.profileId,
          taxProfileId: context.taxProfileId,
        }),
        onDone: {
          context: ({ context, event }) => ({
            ...context,
            declarations: event.output.declarations,
            reportedKinds: event.output.reportedKinds,
          }),
          target: "recording",
        },
        onError: {
          context: ({ context, event }) => ({
            ...context,
            outcome: failed(event.error.cause),
          }),
          target: "failed",
        },
        src: "fetchDues",
      },
    },
    recording: {
      invoke: {
        input: ({ context }) => ({
          declarations: context.declarations,
          profileId: context.profileId,
          reportedKinds: context.reportedKinds,
          taxProfileId: context.taxProfileId,
        }),
        onDone: {
          context: ({ context, event }) => ({
            ...context,
            outcome: syncOutcome.Done({ receipt: event.output }),
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
        src: "recordDues",
      },
    },
  },
});

export const runSyncTaxDues = Effect.fn("runSyncTaxDues")(
  function* runSyncTaxDues(request: SyncTaxDuesRequest) {
    const actor = yield* createEffectActor(syncTaxDuesMachine, {
      input: request,
    });

    yield* watchActor("syncTaxDuesMachine", actor);
    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- A machine-level error or an early stop is a programming error here: the domain failure travels through the `failed` state as a Cause, not through the actor. A machine's ErrorFrom is unknown by design (statelyai/xstate#5725).
    const outcome = yield* join(actor).pipe(Effect.orDie);

    if (outcome === undefined) {
      return yield* Effect.die(
        new Error("syncTaxDuesMachine completed without an outcome")
      );
    }

    return yield* syncOutcome.$match(outcome, {
      Done: ({ receipt }) => Effect.succeed(receipt),
      Failed: ({ cause }) => Effect.failCause(cause),
    });
  },
  Effect.scoped
);
