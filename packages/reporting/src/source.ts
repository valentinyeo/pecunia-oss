import type {
  Category,
  Payee,
  RateLookup,
  TaxObligation,
  Transaction,
} from "@pecunia/core/model";
import { Context } from "effect";
import type { Effect } from "effect";

import type { ReportSourceError } from "./errors.js";
import type {
  AccountBalance,
  CurrencyCode,
  DateOnly,
  ProfileId,
} from "./model.js";

export class ReportSource extends Context.Service<
  ReportSource,
  {
    readonly accounts: (
      profileId: ProfileId
    ) => Effect.Effect<readonly AccountBalance[], ReportSourceError>;
    readonly baseCurrency: (
      profileId: ProfileId
    ) => Effect.Effect<CurrencyCode, ReportSourceError>;
    readonly categories: (
      profileId: ProfileId
    ) => Effect.Effect<readonly Category[], ReportSourceError>;
    readonly obligations: (
      profileId: ProfileId
    ) => Effect.Effect<readonly TaxObligation[], ReportSourceError>;
    readonly payees: (
      profileId: ProfileId
    ) => Effect.Effect<readonly Payee[], ReportSourceError>;
    readonly rates: (profileId: ProfileId) => RateLookup;
    readonly today: (
      profileId: ProfileId
    ) => Effect.Effect<DateOnly, ReportSourceError>;
    readonly transactions: (
      profileId: ProfileId
    ) => Effect.Effect<readonly Transaction[], ReportSourceError>;
  }
>()("@pecunia/reporting/ReportSource") {}
