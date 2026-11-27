// oxlint-disable eslint/max-classes-per-file -- Pecunia's Query and Command services share cache invalidation tags and RPC error handling in one client module.
import { Command, Query } from "@effect/ui";
import {
  ImportSummarySchema,
  ImportTargetSchema,
  ProviderAccountIdSchema,
} from "@pecunia/bank-import/contracts";
import {
  BankLineIdSchema,
  BankLinePageSchema,
  BankLineSchema,
  CategoryChangeSchema,
  CategoryFilterSchema,
  CategoryIdSchema as BankLineCategoryIdSchema,
  NoteChangeSchema,
  ProfileIdSchema as BankLineProfileIdSchema,
  ReviewFilterSchema,
  SearchTextSchema,
} from "@pecunia/bank-lines/model";
import {
  AssetTypeSchema,
  CurrencyCodeSchema as InvestmentCurrencySchema,
  DateOnlySchema as InvestmentDateOnlySchema,
  HoldingIdSchema,
  HoldingNameSchema,
  HoldingSchema,
  HoldingSymbolSchema,
  MinorUnitsSchema as InvestmentMinorUnitsSchema,
  MoneySchema as InvestmentMoneySchema,
  PlatformIdSchema,
  PortfolioSchema,
  ProfileIdSchema as InvestmentProfileIdSchema,
  QuantitySchema,
  TimestampSchema as InvestmentTimestampSchema,
} from "@pecunia/investments/model";
import {
  CategoryPaymentsSchema,
  CategoryReportSchema,
  DashboardSchema,
  IncomeReportSchema,
  MonthListSchema,
  MonthStatementSchema,
  PayeeIdSchema,
  PeriodChoiceSchema,
  ProfileIdSchema as ReportProfileIdSchema,
  SpendingReportSchema,
  YearMonthSchema,
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
import { DateTime, Effect, Layer, Option, Schema } from "effect";

import { PecuniaApi } from "./api.js";

export const SetupTag = Query.Tag("pecunia/Setup");

export const DashboardTag = Query.Tag("pecunia/Dashboard");

export const CategoriesTag = Query.Tag("pecunia/Categories");

export const BankLinesTag = Query.Tag("pecunia/BankLines");

export const SubscriptionsTag = Query.Tag("pecunia/Subscriptions");

export const IncomeTag = Query.Tag("pecunia/Income");

export const MonthsTag = Query.Tag("pecunia/Months");

export const InvestmentsTag = Query.Tag("pecunia/Investments");

export const ImportTargetsTag = Query.Tag("pecunia/ImportTargets");

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

export class ReadCategoryPaymentsQuery extends Query.Service<ReadCategoryPaymentsQuery>()(
  "pecunia/ReadCategoryPayments",
  {
    args: {
      categoryId: Schema.String,
      period: PeriodChoiceSchema,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: CategoryPaymentsSchema,
    tags: [CategoriesTag, BankLinesTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReadCategoryPayments() {
      const api = yield* PecuniaApi;

      return ({ categoryId, period, profileId }) =>
        Effect.gen(function* runReadCategoryPayments() {
          const decodedProfile = yield* Schema.decodeEffect(
            ReportProfileIdSchema
          )(profileId);

          const decodedCategory = yield* Schema.decodeEffect(
            Schema.NonEmptyString.pipe(Schema.brand("CategoryId"))
          )(categoryId);

          return yield* api.readCategoryPayments({
            categoryId: decodedCategory,
            period,
            profileId: decodedProfile,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class ReadIncomeQuery extends Query.Service<ReadIncomeQuery>()(
  "pecunia/ReadIncome",
  {
    args: {
      clientId: Schema.String,
      period: PeriodChoiceSchema,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: IncomeReportSchema,
    tags: [IncomeTag, DashboardTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReadIncome() {
      const api = yield* PecuniaApi;

      return ({ clientId, period, profileId }) =>
        Effect.gen(function* runReadIncome() {
          const decodedProfile = yield* Schema.decodeEffect(
            ReportProfileIdSchema
          )(profileId);

          const decodedClient =
            clientId.length === 0
              ? Option.none()
              : Option.some(
                  yield* Schema.decodeEffect(PayeeIdSchema)(clientId)
                );

          return yield* api.readIncome({
            clientId: decodedClient,
            period,
            profileId: decodedProfile,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class ListMonthsQuery extends Query.Service<ListMonthsQuery>()(
  "pecunia/ListMonths",
  {
    args: {
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "30 seconds",
    success: MonthListSchema,
    tags: [MonthsTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeListMonths() {
      const api = yield* PecuniaApi;

      return ({ profileId }) =>
        Schema.decodeEffect(ReportProfileIdSchema)(profileId).pipe(
          Effect.flatMap((id) => api.listMonths({ profileId: id })),
          Effect.mapError(toUiError)
        );
    })
  );
}

export class ReadMonthQuery extends Query.Service<ReadMonthQuery>()(
  "pecunia/ReadMonth",
  {
    args: {
      month: Schema.String,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: MonthStatementSchema,
    tags: [MonthsTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReadMonth() {
      const api = yield* PecuniaApi;

      return ({ month, profileId }) =>
        Effect.gen(function* runReadMonth() {
          const decodedProfile = yield* Schema.decodeEffect(
            ReportProfileIdSchema
          )(profileId);

          const decodedMonth =
            yield* Schema.decodeEffect(YearMonthSchema)(month);

          return yield* api.readMonth({
            month: decodedMonth,
            profileId: decodedProfile,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class ReadPortfolioQuery extends Query.Service<ReadPortfolioQuery>()(
  "pecunia/ReadPortfolio",
  {
    args: {
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "15 seconds",
    success: PortfolioSchema,
    tags: [InvestmentsTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeReadPortfolio() {
      const api = yield* PecuniaApi;

      return ({ profileId }) =>
        Schema.decodeEffect(InvestmentProfileIdSchema)(profileId).pipe(
          Effect.flatMap((id) =>
            api.readInvestmentPortfolio({ profileId: id })
          ),
          Effect.mapError(toUiError)
        );
    })
  );
}

export class ListImportTargetsQuery extends Query.Service<ListImportTargetsQuery>()(
  "pecunia/ListImportTargets",
  {
    args: {
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    staleTime: "30 seconds",
    success: Schema.Array(ImportTargetSchema),
    tags: [ImportTargetsTag],
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeListImportTargets() {
      const api = yield* PecuniaApi;

      return ({ profileId }) =>
        Schema.decodeEffect(SettingsProfileIdSchema)(profileId).pipe(
          Effect.flatMap((id) => api.listImportTargets({ profileId: id })),
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

export const DirectionFilterName = Schema.Literals(["Any", "in", "out"]);

export type DirectionFilterNameType = typeof DirectionFilterName.Type;

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
      direction: DirectionFilterName,
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

      return ({ direction, profileId, review, search }) =>
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
              direction:
                direction === "Any" ? Option.none() : Option.some(direction),
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
    invalidates: () => [BankLinesTag, DashboardTag, CategoriesTag],
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

export class EditBankLineCategoryCommand extends Command.Service<EditBankLineCategoryCommand>()(
  "pecunia/EditBankLineCategory",
  {
    args: {
      categoryId: Schema.String,
      lineId: Schema.String,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [BankLinesTag, DashboardTag, CategoriesTag, MonthsTag],
    mode: "queue",
    success: BankLineSchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeEditBankLineCategory() {
      const api = yield* PecuniaApi;

      return ({ categoryId, lineId, profileId }) =>
        Effect.gen(function* runEditCategory() {
          const decodedProfile = yield* Schema.decodeEffect(
            BankLineProfileIdSchema
          )(profileId);

          const decodedLine =
            yield* Schema.decodeEffect(BankLineIdSchema)(lineId);

          const category =
            categoryId.length === 0
              ? CategoryChangeSchema.cases.Cleared.make({})
              : CategoryChangeSchema.cases.Assigned.make({
                  categoryId: yield* Schema.decodeEffect(
                    BankLineCategoryIdSchema
                  )(categoryId),
                });

          return yield* api.editBankLine({
            category,
            lineId: decodedLine,
            note: NoteChangeSchema.cases.Unchanged.make({}),
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

export class AddHoldingCommand extends Command.Service<AddHoldingCommand>()(
  "pecunia/AddHolding",
  {
    args: {
      assetType: AssetTypeSchema,
      costBasisMinor: Schema.NullOr(Schema.Int),
      currency: Schema.String,
      name: Schema.String,
      platformId: Schema.String,
      priceMinor: Schema.NullOr(Schema.Int),
      profileId: Schema.String,
      quantityMicros: Schema.Int,
      symbol: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [InvestmentsTag],
    mode: "queue",
    success: HoldingSchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeAddHolding() {
      const api = yield* PecuniaApi;

      return ({
        assetType,
        costBasisMinor,
        currency,
        name,
        platformId,
        priceMinor,
        profileId,
        quantityMicros,
        symbol,
      }) =>
        Effect.gen(function* runAddHolding() {
          const decodedProfile = yield* Schema.decodeEffect(
            InvestmentProfileIdSchema
          )(profileId);

          const decodedCurrency = yield* Schema.decodeEffect(
            InvestmentCurrencySchema
          )(currency);

          const decodedPlatform =
            yield* Schema.decodeEffect(PlatformIdSchema)(platformId);

          const decodedName =
            yield* Schema.decodeEffect(HoldingNameSchema)(name);

          const decodedSymbol =
            yield* Schema.decodeEffect(HoldingSymbolSchema)(symbol);

          const decodedQuantity =
            yield* Schema.decodeEffect(QuantitySchema)(quantityMicros);

          const now = yield* DateTime.now;

          const isoNow = DateTime.formatIso(now);

          const openedOn = yield* Schema.decodeEffect(InvestmentDateOnlySchema)(
            isoNow.slice(0, 10)
          );

          const costBasis =
            costBasisMinor === null
              ? Option.none()
              : Option.some(
                  yield* Schema.decodeEffect(InvestmentMoneySchema)({
                    currency: decodedCurrency,
                    minor: yield* Schema.decodeEffect(
                      InvestmentMinorUnitsSchema
                    )(costBasisMinor),
                  })
                );

          const price =
            priceMinor === null
              ? Option.none()
              : Option.some(
                  yield* Schema.decodeEffect(InvestmentMoneySchema)({
                    currency: decodedCurrency,
                    minor: yield* Schema.decodeEffect(
                      InvestmentMinorUnitsSchema
                    )(priceMinor),
                  })
                );

          const pricedAt =
            priceMinor === null
              ? Option.none()
              : Option.some(
                  yield* Schema.decodeEffect(InvestmentTimestampSchema)(isoNow)
                );

          return yield* api.addHolding({
            assetType,
            costBasis,
            currency: decodedCurrency,
            name: decodedName,
            openedOn,
            platformId: decodedPlatform,
            price,
            pricedAt,
            profileId: decodedProfile,
            quantity: decodedQuantity,
            state: "active",
            symbol: decodedSymbol,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class DeleteHoldingCommand extends Command.Service<DeleteHoldingCommand>()(
  "pecunia/DeleteHolding",
  {
    args: {
      holdingId: Schema.String,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [InvestmentsTag],
    mode: "queue",
    success: HoldingSchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeDeleteHolding() {
      const api = yield* PecuniaApi;

      return ({ holdingId, profileId }) =>
        Effect.gen(function* runDeleteHolding() {
          const decodedProfile = yield* Schema.decodeEffect(
            InvestmentProfileIdSchema
          )(profileId);

          const decodedHolding =
            yield* Schema.decodeEffect(HoldingIdSchema)(holdingId);

          return yield* api.deleteHolding({
            holdingId: decodedHolding,
            profileId: decodedProfile,
          });
        }).pipe(Effect.mapError(toUiError));
    })
  );
}

export class ImportBankFileCommand extends Command.Service<ImportBankFileCommand>()(
  "pecunia/ImportBankFile",
  {
    args: {
      accountId: Schema.String,
      content: Schema.String,
      fileName: Schema.String,
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [
      BankLinesTag,
      DashboardTag,
      CategoriesTag,
      IncomeTag,
      MonthsTag,
    ],
    mode: "queue",
    success: ImportSummarySchema,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* makeImportBankFile() {
      const api = yield* PecuniaApi;

      return ({ accountId, content, fileName, profileId }) =>
        Effect.gen(function* runImportBankFile() {
          const decodedProfile = yield* Schema.decodeEffect(
            SettingsProfileIdSchema
          )(profileId);

          const decodedAccount = yield* Schema.decodeEffect(
            ProviderAccountIdSchema
          )(accountId);

          return yield* api.importBankFile({
            accountId: decodedAccount,
            content,
            fileName:
              fileName.trim().length > 0 ? fileName.trim() : "import.csv",
            profileId: decodedProfile,
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

const ACTIVE_PROFILE_STORAGE_KEY = "pecunia.activeProfileId";

export const SavedProfileTag = Query.Tag("pecunia/SavedProfile");

const readStoredProfileId = (): string | null => {
  try {
    if (globalThis.localStorage === undefined) {
      return null;
    }

    const stored = globalThis.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);

    return stored !== null && stored.length > 0 ? stored : null;
  } catch {
    return null;
  }
};

const writeStoredProfileId = (profileId: string): string => {
  try {
    if (globalThis.localStorage !== undefined) {
      globalThis.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
    }
  } catch {
    return profileId;
  }

  return profileId;
};

export class ReadSavedProfileQuery extends Query.Service<ReadSavedProfileQuery>()(
  "pecunia/ReadSavedProfile",
  {
    args: {},
    error: PecuniaUiError,
    staleTime: "Infinity",
    success: Schema.NullOr(Schema.String),
    tags: [SavedProfileTag],
  }
) {
  static readonly layer = this.toLayer(() => Effect.sync(readStoredProfileId));
}

export class SaveActiveProfileCommand extends Command.Service<SaveActiveProfileCommand>()(
  "pecunia/SaveActiveProfile",
  {
    args: {
      profileId: Schema.String,
    },
    error: PecuniaUiError,
    invalidates: () => [SavedProfileTag],
    mode: "queue",
    success: Schema.String,
  }
) {
  static readonly layer = this.toLayer(({ profileId }) =>
    Effect.sync(() => writeStoredProfileId(profileId))
  );
}

export const pecuniaQueryLayer = Layer.mergeAll(
  ReadSetupQuery.layer,
  ReadSavedProfileQuery.layer,
  ReadDashboardQuery.layer,
  ReadCategoriesQuery.layer,
  ReadSpendingQuery.layer,
  ReadCategoryPaymentsQuery.layer,
  ReadIncomeQuery.layer,
  ListMonthsQuery.layer,
  ReadMonthQuery.layer,
  ReadPortfolioQuery.layer,
  ListImportTargetsQuery.layer,
  ListBankLinesQuery.layer,
  ListSubscriptionsQuery.layer,
  ReviewBankLineCommand.layer,
  EditBankLineNoteCommand.layer,
  EditBankLineCategoryCommand.layer,
  ChangeSubscriptionStatusCommand.layer,
  AddHoldingCommand.layer,
  DeleteHoldingCommand.layer,
  ImportBankFileCommand.layer,
  SaveSettingsCommand.layer,
  CreateProfileCommand.layer,
  SaveActiveProfileCommand.layer
);

export const pecuniaDeferredPrerenderLayer = Layer.mergeAll(
  ReadSetupQuery.toLayer(() => Effect.never),
  ReadSavedProfileQuery.toLayer(() => Effect.succeed(null)),
  ReadDashboardQuery.toLayer(() => Effect.never),
  ReadCategoriesQuery.toLayer(() => Effect.never),
  ReadSpendingQuery.toLayer(() => Effect.never),
  ReadCategoryPaymentsQuery.toLayer(() => Effect.never),
  ReadIncomeQuery.toLayer(() => Effect.never),
  ListMonthsQuery.toLayer(() => Effect.never),
  ReadMonthQuery.toLayer(() => Effect.never),
  ReadPortfolioQuery.toLayer(() => Effect.never),
  ListImportTargetsQuery.toLayer(() => Effect.never),
  ListBankLinesQuery.toLayer(() => Effect.never),
  ListSubscriptionsQuery.toLayer(() => Effect.never),
  ReviewBankLineCommand.toLayer(() => Effect.never),
  EditBankLineNoteCommand.toLayer(() => Effect.never),
  EditBankLineCategoryCommand.toLayer(() => Effect.never),
  ChangeSubscriptionStatusCommand.toLayer(() => Effect.never),
  AddHoldingCommand.toLayer(() => Effect.never),
  DeleteHoldingCommand.toLayer(() => Effect.never),
  ImportBankFileCommand.toLayer(() => Effect.never),
  SaveSettingsCommand.toLayer(() => Effect.never),
  CreateProfileCommand.toLayer(() => Effect.never),
  SaveActiveProfileCommand.toLayer(() => Effect.never)
);
