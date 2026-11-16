import { Effect, Result, Schema } from "effect";

import type { AccountId, Cursor, ProviderId, RejectedLine } from "./model.js";
import { RejectedLineSchema } from "./model.js";
import { parsePage } from "./parse.js";
import { BankProvider } from "./provider.js";
import { retryStep } from "./retry.js";
import type { RetryClock, RetryPolicy } from "./retry.js";
import { BankLineStore } from "./store.js";

export const SyncStepSchema = Schema.Literals([
  "fetchPage",
  "parsePage",
  "storePage",
  "advanceCursor",
]);

export type SyncStep = typeof SyncStepSchema.Type;

export const maxReportedRejections = 100;

export const SyncedSchema = Schema.TaggedStruct("Synced", {
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  cursor: Schema.NullOr(Schema.String),
  pages: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  rejected: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  rejectedLines: Schema.Array(RejectedLineSchema).check(
    Schema.isMaxLength(maxReportedRejections)
  ),
  rejectedNotShown: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export const FailedSchema = Schema.TaggedStruct("Failed", {
  attempts: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  reason: Schema.String,
  step: SyncStepSchema,
});

export const SyncOutcomeSchema = Schema.Union([SyncedSchema, FailedSchema]);

export type SyncOutcome = typeof SyncOutcomeSchema.Type;

export interface SyncRequest {
  readonly accountId: AccountId;
  readonly maxPages: number;
  readonly providerId: ProviderId;
  readonly retry: RetryPolicy;
  readonly startCursor: Cursor | null;
}

interface SyncProgress {
  readonly count: number;
  readonly cursor: Cursor | null;
  readonly pages: number;
  readonly rejected: number;
  readonly rejectedLines: readonly RejectedLine[];
}

const reportedRejections = (
  progress: SyncProgress,
  rejected: readonly RejectedLine[]
): readonly RejectedLine[] => {
  const room = maxReportedRejections - progress.rejectedLines.length;

  return room <= 0
    ? progress.rejectedLines
    : [...progress.rejectedLines, ...rejected.slice(0, room)];
};

export const runSync = (
  request: SyncRequest
): Effect.Effect<
  SyncOutcome,
  never,
  BankProvider | BankLineStore | RetryClock
> =>
  Effect.gen(function* syncPages() {
    const provider = yield* BankProvider;
    const store = yield* BankLineStore;

    const syncFrom = (
      progress: SyncProgress
    ): Effect.Effect<
      SyncOutcome,
      never,
      BankProvider | BankLineStore | RetryClock
    > =>
      Effect.gen(function* syncPage() {
        const fetched = yield* retryStep(request.retry, () =>
          provider.fetchPage({
            accountId: request.accountId,
            cursor: progress.cursor,
          })
        );

        if (Result.isFailure(fetched.result)) {
          return FailedSchema.make({
            attempts: fetched.attempts,
            reason: fetched.result.failure,
            step: "fetchPage",
          });
        }

        const parsed = parsePage(fetched.result.success);

        if (Result.isFailure(parsed)) {
          return FailedSchema.make({
            attempts: 1,
            reason: parsed.failure.reason,
            step: "parsePage",
          });
        }

        const stored = yield* retryStep(request.retry, () =>
          store.storeLines(request.providerId, parsed.success.lines)
        );

        if (Result.isFailure(stored.result)) {
          return FailedSchema.make({
            attempts: stored.attempts,
            reason: stored.result.failure,
            step: "storePage",
          });
        }

        const advanced: SyncProgress = {
          count: progress.count + stored.result.success.inserted,
          cursor: parsed.success.nextCursor,
          pages: progress.pages + 1,
          rejected: progress.rejected + parsed.success.rejected.length,
          rejectedLines: reportedRejections(progress, parsed.success.rejected),
        };

        const atEnd =
          advanced.cursor === null || advanced.cursor === progress.cursor;

        if (atEnd || advanced.pages >= request.maxPages) {
          return SyncedSchema.make({
            ...advanced,
            rejectedNotShown: advanced.rejected - advanced.rejectedLines.length,
          });
        }

        return yield* syncFrom(advanced);
      });

    return yield* syncFrom({
      count: 0,
      cursor: request.startCursor,
      pages: 0,
      rejected: 0,
      rejectedLines: [],
    });
  });
