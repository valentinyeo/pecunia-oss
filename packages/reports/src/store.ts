import type { ProfileId } from "@pecunia/access";
import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { Report, ReportId } from "./model.js";
import type { ReportStoreError } from "./report-store-error.js";

export interface ReportStorePort {
  readonly delete: (
    profileId: ProfileId,
    id: ReportId
  ) => Effect.Effect<Option.Option<Report>, ReportStoreError>;
  readonly get: (
    profileId: ProfileId,
    id: ReportId
  ) => Effect.Effect<Option.Option<Report>, ReportStoreError>;
  readonly list: (
    profileId: ProfileId
  ) => Effect.Effect<readonly Report[], ReportStoreError>;
  readonly save: (
    profileId: ProfileId,
    report: Report
  ) => Effect.Effect<Report, ReportStoreError>;
}

export class ReportStore extends Context.Service<
  ReportStore,
  ReportStorePort
>()("@pecunia/reports/ReportStore") {}
