import { ProfileIdSchema } from "@pecunia/access";
import type { ProfileId } from "@pecunia/access";
import { Context, Effect, Layer, Schema } from "effect";

import { TimestampMillisSchema } from "./primitives.js";

export const ReportIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("ReportId"));

export type ReportId = typeof ReportIdSchema.Type;

export const ReportKindSchema = Schema.Literals(["exploration", "report"]);

export type ReportKind = typeof ReportKindSchema.Type;

export const ReportSlugSchema = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  Schema.isMaxLength(120)
);

export const ReportSummarySchema = Schema.Struct({
  id: ReportIdSchema,
  kind: ReportKindSchema,
  profileId: ProfileIdSchema,
  slug: ReportSlugSchema,
  title: Schema.NonEmptyString.check(Schema.isMaxLength(120)),
  updatedAt: TimestampMillisSchema,
});

export type ReportSummary = typeof ReportSummarySchema.Type;

export interface ReportStorePort {
  readonly list: (
    profileId: ProfileId
  ) => Effect.Effect<readonly ReportSummary[]>;
}

export class ReportStore extends Context.Service<
  ReportStore,
  ReportStorePort
>()("@pecunia/ai-tools/ReportStore") {}

export const memoryReportStoreLayer = (
  reports: readonly ReportSummary[]
): Layer.Layer<ReportStore> =>
  Layer.succeed(ReportStore, {
    list: (profileId) =>
      Effect.succeed(
        reports.filter((report) => report.profileId === profileId)
      ),
  });
