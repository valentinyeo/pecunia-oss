import { Schema } from "effect";

import {
  DateOnlySchema,
  ProfileIdSchema,
  ProviderAccountIdSchema,
  SyncRunIdSchema,
  TimestampSchema,
} from "./primitives.js";

export const SyncRunKindSchema = Schema.Literals([
  "bank_sync",
  "categorization",
]);

export type SyncRunKind = typeof SyncRunKindSchema.Type;

export const SyncCountsSchema = Schema.Struct({
  imported: Schema.Int,
  rejected: Schema.Int,
  skipped: Schema.Int,
});

export type SyncCounts = typeof SyncCountsSchema.Type;

const noRunDetail = {
  at: Schema.optionalKey(Schema.Never),
  chunk: Schema.optionalKey(Schema.Never),
  counts: Schema.optionalKey(Schema.Never),
  startedAt: Schema.optionalKey(Schema.Never),
  tag: Schema.optionalKey(Schema.Never),
} as const;

export const SyncRunStateSchema = Schema.TaggedUnion({
  Cancelled: { ...noRunDetail, at: TimestampSchema },
  Categorizing: { ...noRunDetail, at: TimestampSchema },
  ChunkDone: { ...noRunDetail, at: TimestampSchema, chunk: Schema.Int },
  Failed: { ...noRunDetail, at: TimestampSchema, tag: Schema.NonEmptyString },
  Running: { ...noRunDetail, chunk: Schema.Int, startedAt: TimestampSchema },
  Succeeded: { ...noRunDetail, at: TimestampSchema, counts: SyncCountsSchema },
});

export type SyncRunState = typeof SyncRunStateSchema.Type;

export const SyncRunSchema = Schema.Struct({
  accountId: Schema.OptionFromNullishOr(ProviderAccountIdSchema),
  id: SyncRunIdSchema,
  kind: SyncRunKindSchema,
  leaseExpiresAt: TimestampSchema,
  leaseOwner: Schema.NonEmptyString,
  profileId: ProfileIdSchema,
  state: SyncRunStateSchema,
  window: Schema.Struct({ from: DateOnlySchema, to: DateOnlySchema }),
});

export type SyncRun = typeof SyncRunSchema.Type;
