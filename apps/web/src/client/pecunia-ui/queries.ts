// oxlint-disable eslint/max-classes-per-file -- Pecunia's Query and Command services share cache invalidation tags and RPC error handling in one client module.
import { Command, Query } from "@effect/ui";
import {
  BankLineIdSchema,
  BankLinePageSchema,
  BankLineSchema,
  CategoryChangeSchema,
  CategoryFilterSchema,
  NoteChangeSchema,
  ProfileIdSchema as BankLineProfileIdSchema,
  ReviewFilterSchema,
  SearchTextSchema,
} from "@pecunia/bank-lines/model";
import {
  CategoryReportSchema,
  DashboardSchema,
  PeriodChoiceSchema,
  ProfileIdSchema as ReportProfileIdSchema,
  SpendingReportSchema,
} from "@pecunia/reporting";
import {
  CurrencyCodeSchema,
  LocaleSchema,
  ProfileIdSchema as SettingsProfileIdSchema,
  ProfileKindSchema,
  ProfileNameSchema,
  ProfileSchema,
  SetupSchema,
  TimeZoneSchema,
} from "@pecunia/settings/contracts";
import {
  ProfileIdSchema as SubProfileIdSchema,
  StatusChangeSchema,
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
  SubscriptionPageSchema,
  SubscriptionViewSchema,
} from "@pecunia/subscriptions";
import { Effect, Layer, Option, Schema } from "effect";

import { PecuniaApi } from "./api.js";

export const SetupTag = Query.Tag("pecunia/Setup");

export const DashboardTag = Query.Tag("pecunia/Dashboard");

export const CategoriesTag = Query.Tag("pecunia/Categories");

export const BankLinesTag = Query.Tag("pecunia/BankLines");

export const SubscriptionsTag = Query.Tag("pecunia/Subscriptions");

export const PecuniaUiError = Schema.Struct({
  message: Schema.String,
});

export type PecuniaUiErrorType = typeof PecuniaUiError.Type;

const toUiError = (error: {
  readonly message?: string;
}): PecuniaUiErrorType => ({
  message:
    error.message !== undefined && error.message.length > 0
      ? error.message
      : "The Pecunia RPC request failed. Reload and try again.",
});

export class ReadSetupQuery extends Query.Service<ReadSetupQuery>()(
  "pecunia/ReadSetup",
  {
    args: {},
    error: PecuniaUiError,
    staleTime: "30 seconds",
    success: SetupSchema,
    tags: [SetupTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReadSetup() {
      const api = yield* PecuniaApi;

      return () => api.readSetup({}).pipe(Effect.mapError(toUiError));
    })
  );
}

export class ReadDashboardQuery extends Query.Service<ReadDashboardQuery>()(
  "pecunia/ReadDashboard",
  {
    args: {
      period: PeriodChoiceSchema,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: DashboardSchema,
    tags: [DashboardTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReadDashboard() {
      const api = yield* PecuniaApi;

      return ({ period, profileId }) =>
        Schema.decodeEffect(ReportProfileIdSchema)(profileId).pipe(
          Effect.flatMap((id) => api.readDashboard({ period, profileId: id })),
          Effect.mapError(toUiError)
        );
    })
  );
}

export class ReadCategoriesQuery extends Query.Service<ReadCategoriesQuery>()(
  "pecunia/ReadCategories",
  {
    args: {
      period: PeriodChoiceSchema,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: CategoryReportSchema,
    tags: [CategoriesTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReadCategories() {
      const api = yield* PecuniaApi;

      return ({ period, profileId }) =>
        Schema.decodeEffect(ReportProfileIdSchema)(profileId).pipe(
          Effect.flatMap((id) => api.readCategories({ period, profileId: id })),
          Effect.mapError(toUiError)
        );
    })
  );
}

export class ReadSpendingQuery extends Query.Service<ReadSpendingQuery>()(
  "pecunia/ReadSpending",
  {
    args: {
      period: PeriodChoiceSchema,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: SpendingReportSchema,
    tags: [CategoriesTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReadSpending() {
      const api = yield* PecuniaApi;

      return ({ period, profileId }) =>
        Schema.decodeEffect(ReportProfileIdSchema)(profileId).pipe(
          Effect.flatMap((id) => api.readSpending({ period, profileId: id })),
          Effect.mapError(toUiError)
        );
    })
  );
}

export const ReviewFilterName = Schema.Literals([
  "Any",
  "Awaiting",
  "Reviewed",
]);

export type ReviewFilterNameType = typeof ReviewFilterName.Type;

const reviewFilterOf = (filter: ReviewFilterNameType) => {
  if (filter === "Awaiting") {
    return ReviewFilterSchema.cases.Awaiting.make({});
  }

  if (filter === "Reviewed") {
    return ReviewFilterSchema.cases.Reviewed.make({});
  }

  return ReviewFilterSchema.cases.Any.make({});
};

export class ListBankLinesQuery extends Query.Service<ListBankLinesQuery>()(
  "pecunia/ListBankLines",
  {
    args: {
      profileId: Schema.String,
      review: ReviewFilterName,
      search: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: BankLinePageSchema,
    tags: [BankLinesTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeListBankLines() {
      const api = yield* PecuniaApi;

      return ({ profileId, review, search }) =>
        Effect.gen(function* runListBankLines() {
          const decodedProfile = yield* Schema.decodeEffect(
            BankLineProfileIdSchema
          )(profileId);

          const decodedSearch =
            yield* Schema.decodeEffect(SearchTextSchema)(search);

          return yield* api.listBankLines({
            cursor: Option.none(),
            filter: {
              account: Option.none(),
              amount: Option.none(),
              category: CategoryFilterSchema.cases.Any.make({}),
              direction: Option.none(),
              occurred: Option.none(),
              review: reviewFilterOf(review),
            },
            limit: 50,
            profileId: decodedProfile,
            search: decodedSearch,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export const SubscriptionFilterName = Schema.Literals(["Active", "All"]);

export type SubscriptionFilterNameType = typeof SubscriptionFilterName.Type;

export class ListSubscriptionsQuery extends Query.Service<ListSubscriptionsQuery>()(
  "pecunia/ListSubscriptions",
  {
    args: {
      filter: SubscriptionFilterName,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: SubscriptionPageSchema,
    tags: [SubscriptionsTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeListSubscriptions() {
      const api = yield* PecuniaApi;

      return ({ filter, profileId }) =>
        Schema.decodeEffect(SubProfileIdSchema)(profileId).pipe(
          Effect.flatMap((id) =>
            api.listSubscriptions({
              filter:
                filter === "Active"
                  ? SubscriptionFilterSchema.cases.Active.make({})
                  : SubscriptionFilterSchema.cases.All.make({}),
              profileId: id,
            })
          ),
          Effect.mapError(toUiError)
        );
    })
  );
}

export class ReviewBankLineCommand extends Command.Service<ReviewBankLineCommand>()(
  "pecunia/ReviewBankLine",
  {
    args: {
      lineId: Schema.String,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [BankLinesTag, DashboardTag],
    mode: "queue",
    success: BankLineSchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReviewBankLine() {
      const api = yield* PecuniaApi;

      return ({ lineId, profileId }) =>
        Effect.gen(function* runReview() {
          const decodedProfile = yield* Schema.decodeEffect(
            BankLineProfileIdSchema
          )(profileId);

          const decodedLine =
            yield* Schema.decodeEffect(BankLineIdSchema)(lineId);

          return yield* api.reviewBankLine({
            lineId: decodedLine,
            profileId: decodedProfile,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class EditBankLineNoteCommand extends Command.Service<EditBankLineNoteCommand>()(
  "pecunia/EditBankLineNote",
  {
    args: {
      lineId: Schema.String,
      note: Schema.String,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [BankLinesTag, DashboardTag, CategoriesTag],
    mode: "queue",
    success: BankLineSchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeEditBankLineNote() {
      const api = yield* PecuniaApi;

      return ({ lineId, note, profileId }) =>
        Effect.gen(function* runEditNote() {
          const decodedProfile = yield* Schema.decodeEffect(
            BankLineProfileIdSchema
          )(profileId);

          const decodedLine =
            yield* Schema.decodeEffect(BankLineIdSchema)(lineId);

          return yield* api.editBankLine({
            category: CategoryChangeSchema.cases.Unchanged.make({}),
            lineId: decodedLine,
            note: NoteChangeSchema.cases.Set.make({ text: note }),
            profileId: decodedProfile,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class ChangeSubscriptionStatusCommand extends Command.Service<ChangeSubscriptionStatusCommand>()(
  "pecunia/ChangeSubscriptionStatus",
  {
    args: {
      action: Schema.Literals(["Cancel", "RestoreConfirmed"]),
      profileId: Schema.String,
      subscriptionId: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [SubscriptionsTag],
    mode: "queue",
    success: SubscriptionViewSchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeChangeSubStatus() {
      const api = yield* PecuniaApi;

      return ({ action, profileId, subscriptionId }) =>
        Effect.gen(function* runChangeStatus() {
          const decodedProfile =
            yield* Schema.decodeEffect(SubProfileIdSchema)(profileId);

          const decodedSub =
            yield* Schema.decodeEffect(SubscriptionIdSchema)(subscriptionId);

          const change =
            action === "Cancel"
              ? StatusChangeSchema.cases.Cancel.make({})
              : StatusChangeSchema.cases.Restore.make({ to: "Confirmed" });

          return yield* api.changeSubscriptionStatus({
            change,
            profileId: decodedProfile,
            subscriptionId: decodedSub,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class SaveSettingsCommand extends Command.Service<SaveSettingsCommand>()(
  "pecunia/SaveSettings",
  {
    args: {
      baseCurrency: Schema.String,
      locale: Schema.String,
      primaryProfileId: Schema.String,
      timezone: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [SetupTag, DashboardTag],
    mode: "queue",
    success: SetupSchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeSaveSettings() {
      const api = yield* PecuniaApi;

      return ({ baseCurrency, locale, primaryProfileId, timezone }) =>
        Effect.gen(function* runSaveSettings() {
          const decodedCurrency =
            yield* Schema.decodeEffect(CurrencyCodeSchema)(baseCurrency);

          const decodedLocale =
            yield* Schema.decodeEffect(LocaleSchema)(locale);

          const decodedProfile = yield* Schema.decodeEffect(
            SettingsProfileIdSchema
          )(primaryProfileId);

          const decodedTz =
            yield* Schema.decodeEffect(TimeZoneSchema)(timezone);

          return yield* api.saveSettings({
            baseCurrency: decodedCurrency,
            locale: decodedLocale,
            primaryProfileId: decodedProfile,
            timezone: decodedTz,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class CreateProfileCommand extends Command.Service<CreateProfileCommand>()(
  "pecunia/CreateProfile",
  {
    args: {
      baseCurrency: Schema.String,
      kind: ProfileKindSchema,
      name: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [SetupTag],
    mode: "queue",
    success: ProfileSchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeCreateProfile() {
      const api = yield* PecuniaApi;

      return ({ baseCurrency, kind, name }) =>
        Effect.gen(function* runCreateProfile() {
          const decodedCurrency =
            yield* Schema.decodeEffect(CurrencyCodeSchema)(baseCurrency);

          const decodedName =
            yield* Schema.decodeEffect(ProfileNameSchema)(name);

          return yield* api.createProfile({
            baseCurrency: decodedCurrency,
            kind,
            name: decodedName,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export const pecuniaQueryLayer = Layer.mergeAll(
  ReadSetupQuery.layer,
  ReadDashboardQuery.layer,
  ReadCategoriesQuery.layer,
  ReadSpendingQuery.layer,
  ListBankLinesQuery.layer,
  ListSubscriptionsQuery.layer,
  ReviewBankLineCommand.layer,
  EditBankLineNoteCommand.layer,
  ChangeSubscriptionStatusCommand.layer,
  SaveSettingsCommand.layer,
  CreateProfileCommand.layer
);

export const pecuniaDeferredPrerenderLayer = Layer.mergeAll(
  ReadSetupQuery.toLayer(() => Effect.never),
  ReadDashboardQuery.toLayer(() => Effect.never),
  ReadCategoriesQuery.toLayer(() => Effect.never),
  ReadSpendingQuery.toLayer(() => Effect.never),
  ListBankLinesQuery.toLayer(() => Effect.never),
  ListSubscriptionsQuery.toLayer(() => Effect.never),
  ReviewBankLineCommand.toLayer(() => Effect.never),
  EditBankLineNoteCommand.toLayer(() => Effect.never),
  ChangeSubscriptionStatusCommand.toLayer(() => Effect.never),
  SaveSettingsCommand.toLayer(() => Effect.never),
  CreateProfileCommand.toLayer(() => Effect.never)
);
