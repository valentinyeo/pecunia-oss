import { Schema } from "effect";

import { closed, closedUnion } from "./closed-union.js";
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

export const SyncCountsSchema = closed(
  Schema.Struct({
    imported: Schema.Int,
    rejected: Schema.Int,
    skipped: Schema.Int,
  })
);

export type SyncCounts = typeof SyncCountsSchema.Type;

export const SyncRunStateSchema = closed(
  closedUnion([
    Schema.TaggedStruct("Cancelled", { at: TimestampSchema }),
    Schema.TaggedStruct("Categorizing", { at: TimestampSchema }),
    Schema.TaggedStruct("ChunkDone", {
      at: TimestampSchema,
      chunk: Schema.Int,
    }),
    Schema.TaggedStruct("Failed", {
      at: TimestampSchema,
      tag: Schema.NonEmptyString,
    }),
    Schema.TaggedStruct("Running", {
      chunk: Schema.Int,
      startedAt: TimestampSchema,
    }),
    Schema.TaggedStruct("Succeeded", {
      at: TimestampSchema,
      counts: SyncCountsSchema,
    }),
  ]).pipe(Schema.toTaggedUnion("_tag"))
);

export type SyncRunState = typeof SyncRunStateSchema.Type;

export const SyncRunSchema = closed(
  Schema.Struct({
    accountId: Schema.OptionFromNullishOr(ProviderAccountIdSchema),
    id: SyncRunIdSchema,
    kind: SyncRunKindSchema,
    leaseExpiresAt: TimestampSchema,
    leaseOwner: Schema.NonEmptyString,
    profileId: ProfileIdSchema,
    state: SyncRunStateSchema,
    window: Schema.Struct({ from: DateOnlySchema, to: DateOnlySchema }),
  })
);

export type SyncRun = typeof SyncRunSchema.Type;
