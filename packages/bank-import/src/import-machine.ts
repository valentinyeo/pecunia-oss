import { watchActor } from "@pecunia/capability/actor-watch";
import {
  ImportAccountNotFound,
  ProviderAccountIdSchema,
} from "@pecunia/core/bank-import";
import type {
  BankFileRejected,
  ImportSummary,
  ImportUnavailable,
  ProviderAccountId,
  RejectedLine,
} from "@pecunia/core/bank-import";
import { ProfileIdSchema } from "@pecunia/core/settings";
import type { ProfileId } from "@pecunia/core/settings";
import {
  createEffectActor,
  createEffectLogic,
  join,
  setupEffect,
} from "@xstate/effect";
import { Data, Effect, Option, Schema } from "effect";
import type { Cause } from "effect";
import { types } from "xstate";

import { fingerprintLine } from "./fingerprint.js";
import { ImportLedger } from "./import-ledger.js";
import type { RecordedLines } from "./import-ledger.js";
import { FingerprintedLineSchema, ParsedLineSchema } from "./line.js";
import type { FingerprintedLine, ParsedLine } from "./line.js";
import { parseBankFile } from "./parse-bank-file.js";

export const ImportRequestSchema = Schema.Struct({
  accountId: ProviderAccountIdSchema,
  content: Schema.String,
  fileName: Schema.NonEmptyString,
  profileId: ProfileIdSchema,
});

export type ImportRequest = typeof ImportRequestSchema.Type;

export type ImportOutcome = Data.TaggedEnum<{
  Done: { readonly summary: ImportSummary };
  Failed: {
    readonly cause: Cause.Cause<
      BankFileRejected | ImportAccountNotFound | ImportUnavailable
    >;
  };
}>;

export const importOutcome = Data.taggedEnum<ImportOutcome>();

interface ImportContext {
  readonly accountId: ProviderAccountId;
  readonly content: string;
  readonly fileName: string;
  readonly fingerprinted: readonly FingerprintedLine[];
  readonly outcome: ImportOutcome | undefined;
  readonly parsed: readonly ParsedLine[];
  readonly profileId: ProfileId;
  readonly rejected: readonly RejectedLine[];
}

const readFile = createEffectLogic({
  effect: ({ input }) =>
    Effect.gen(function* readAccountFile() {
      const target = yield* ImportLedger.use((ledger) =>
        ledger.findTarget(input.profileId, input.accountId)
      );

      if (Option.isNone(target)) {
        return yield* new ImportAccountNotFound({
          accountId: input.accountId,
          profileId: input.profileId,
        });
      }

      const parsed = yield* parseBankFile({
        baseCurrency: target.value.baseCurrency,
        content: input.content,
        fileName: input.fileName,
      });

      return parsed;
    }),
  schemas: { input: ImportRequestSchema },
});

const fingerprintLines = createEffectLogic({
  effect: ({ input }) =>
    // oxlint-disable-next-line unicorn/no-array-method-this-argument -- Effect.forEach is not Array#forEach; the callback is an effectful mapper.
    Effect.forEach(input.parsed, (line) => fingerprintLine(line)),
  schemas: {
    input: Schema.Struct({ parsed: Schema.Array(ParsedLineSchema) }),
  },
});

const recordLines = createEffectLogic({
  effect: ({ input }) =>
    ImportLedger.use((ledger) =>
      ledger.record(input.profileId, input.accountId, input.fingerprinted)
    ),
  schemas: {
    input: Schema.Struct({
      accountId: ProviderAccountIdSchema,
      fingerprinted: Schema.Array(FingerprintedLineSchema),
      profileId: ProfileIdSchema,
    }),
  },
});

const recorded = (input: {
  readonly context: ImportContext;
  readonly recorded: RecordedLines;
}): ImportOutcome =>
  importOutcome.Done({
    summary: {
      alreadyImported: input.recorded.alreadyImported,
      fileName: input.context.fileName,
      imported: input.recorded.imported,
      rejected: input.context.rejected,
    },
  });

const failed = (cause: ImportOutcomeFailure): ImportOutcome =>
  importOutcome.Failed({ cause });

type ImportOutcomeFailure = Cause.Cause<
  BankFileRejected | ImportAccountNotFound | ImportUnavailable
>;

export const importMachine = setupEffect({
  actors: { fingerprintLines, readFile, recordLines },
  schemas: {
    context: types<ImportContext>(),
    input: ImportRequestSchema,
  },
}).createMachine({
  context: ({ input }) => ({
    ...input,
    fingerprinted: [],
    outcome: undefined,
    parsed: [],
    rejected: [],
  }),
  initial: "reading",
  output: ({ context }) => context.outcome,
  states: {
    done: { type: "final" },
    failed: { type: "final" },
    fingerprinting: {
      invoke: {
        input: ({ context }) => ({ parsed: context.parsed }),
        onDone: {
          context: ({ context, event }) => ({
            ...context,
            fingerprinted: event.output,
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
        src: "fingerprintLines",
      },
    },
    reading: {
      invoke: {
        input: ({ context }) => ({
          accountId: context.accountId,
          content: context.content,
          fileName: context.fileName,
          profileId: context.profileId,
        }),
        onDone: {
          context: ({ context, event }) => ({
            ...context,
            parsed: event.output.lines,
            rejected: event.output.rejected,
          }),
          target: "fingerprinting",
        },
        onError: {
          context: ({ context, event }) => ({
            ...context,
            outcome: failed(event.error.cause),
          }),
          target: "failed",
        },
        src: "readFile",
      },
    },
    recording: {
      invoke: {
        input: ({ context }) => ({
          accountId: context.accountId,
          fingerprinted: context.fingerprinted,
          profileId: context.profileId,
        }),
        onDone: {
          context: ({ context, event }) => ({
            ...context,
            outcome: recorded({ context, recorded: event.output }),
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
        src: "recordLines",
      },
    },
  },
});

export const runImportMachine = Effect.fn("runImportMachine")(
  function* runImportMachine(request: ImportRequest) {
    const actor = yield* createEffectActor(importMachine, { input: request });
    yield* watchActor("importMachine", actor);
    // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- A machine-level error or an early stop is a programming error here: the domain failure travels through the `failed` state as a Cause, not through the actor. A machine's ErrorFrom is unknown by design (statelyai/xstate#5725).
    const outcome = yield* join(actor).pipe(Effect.orDie);

    if (outcome === undefined) {
      return yield* Effect.die(
        new Error("importMachine completed without an outcome")
      );
    }

    return yield* importOutcome.$match(outcome, {
      Done: ({ summary }) => Effect.succeed(summary),
      Failed: ({ cause }) => Effect.failCause(cause),
    });
  },
  Effect.scoped
);
