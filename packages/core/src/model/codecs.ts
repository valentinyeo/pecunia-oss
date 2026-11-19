import { AppSettingSchema } from "./app-setting.js";
import {
  CategorySchema,
  MerchantAliasSchema,
  PayeeKindSchema,
  PayeeSchema,
  SpendingTypeSchema,
} from "./category.js";
import { codec } from "./codec.js";
import { ConvertedAmountSchema } from "./converted-amount.js";
import { errorCodecs } from "./errors.js";
import {
  AssetTypeSchema,
  HoldingSchema,
  InvestmentPlatformSchema,
  PendingHoldingSchema,
  PricedHoldingSchema,
} from "./investment.js";
import {
  ArchiveStateSchema,
  ArchiveTargetSchema,
  DocumentSourceSchema,
  DocumentTypeSchema,
  InvoiceDocumentSchema,
  InvoiceExceptionSchema,
  InvoiceSourceSchema,
} from "./invoice.js";
import { ExchangeRateSchema } from "./market.js";
import { AmountsSchema, SameCurrencyAmountSchema } from "./money.js";
import {
  AliasIdSchema,
  ArchiveTargetIdSchema,
  CategoryIdSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  DocumentIdSchema,
  HoldingIdSchema,
  InvoiceSourceIdSchema,
  MemberIdSchema,
  MinorUnitsSchema,
  MoneySchema,
  PayeeIdSchema,
  PlatformIdSchema,
  ProfileIdSchema,
  ProviderAccountIdSchema,
  ProviderIdSchema,
  QuantitySchema,
  ReportIdSchema,
  RuleIdSchema,
  SubscriptionIdSchema,
  SyncRunIdSchema,
  TaxObligationIdSchema,
  TaxProfileIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "./primitives.js";
import {
  MemberSchema,
  ProfileKindSchema,
  ProfileSchema,
  RoleSchema,
} from "./profile.js";
import {
  ProviderAccountSchema,
  ProviderKindSchema,
  ProviderSchema,
} from "./provider.js";
import { RateSchema } from "./rate.js";
import { ReportSchema } from "./report.js";
import {
  MatchFieldSchema,
  MatchTypeSchema,
  RuleDirectionSchema,
  RuleSchema,
} from "./rule.js";
import {
  SyncCountsSchema,
  SyncRunKindSchema,
  SyncRunSchema,
  SyncRunStateSchema,
} from "./run.js";
import {
  FrequencySchema,
  SubscriptionSchema,
  SubscriptionStatusSchema,
} from "./subscription.js";
import {
  TaxObligationSchema,
  TaxObligationStatusSchema,
  TaxProfileSchema,
} from "./tax.js";
import {
  CategorizationSchema,
  ClassificationSchema,
  DirectionSchema,
  TransactionSchema,
} from "./transaction.js";

export const codecs = {
  ...errorCodecs,
  aliasId: codec("AliasIdSchema", AliasIdSchema),
  amounts: codec("AmountsSchema", AmountsSchema, [
    "AmountsSchema",
    "ConvertedAmount",
    "ConvertedAmountSchema",
    "SameCurrencyAmountSchema",
  ]),
  appSetting: codec("AppSettingSchema", AppSettingSchema),
  archiveState: codec("ArchiveStateSchema", ArchiveStateSchema),
  archiveTargetId: codec("ArchiveTargetIdSchema", ArchiveTargetIdSchema),
  archiveTarget: codec("ArchiveTargetSchema", ArchiveTargetSchema),
  assetType: codec("AssetTypeSchema", AssetTypeSchema),
  categorization: codec("CategorizationSchema", CategorizationSchema),
  categoryId: codec("CategoryIdSchema", CategoryIdSchema),
  category: codec("CategorySchema", CategorySchema),
  classification: codec("ClassificationSchema", ClassificationSchema),
  convertedAmount: codec("ConvertedAmountSchema", ConvertedAmountSchema, [
    "ConvertedAmount",
    "ConvertedAmountSchema",
  ]),
  currencyCode: codec("CurrencyCodeSchema", CurrencyCodeSchema),
  dateOnly: codec("DateOnlySchema", DateOnlySchema),
  direction: codec("DirectionSchema", DirectionSchema),
  documentId: codec("DocumentIdSchema", DocumentIdSchema),
  documentSource: codec("DocumentSourceSchema", DocumentSourceSchema),
  documentType: codec("DocumentTypeSchema", DocumentTypeSchema),
  exchangeRate: codec("ExchangeRateSchema", ExchangeRateSchema),
  frequency: codec("FrequencySchema", FrequencySchema),
  holdingId: codec("HoldingIdSchema", HoldingIdSchema),
  holding: codec("HoldingSchema", HoldingSchema),
  investmentPlatform: codec(
    "InvestmentPlatformSchema",
    InvestmentPlatformSchema
  ),
  invoiceDocument: codec("InvoiceDocumentSchema", InvoiceDocumentSchema),
  invoiceException: codec("InvoiceExceptionSchema", InvoiceExceptionSchema),
  invoiceSourceId: codec("InvoiceSourceIdSchema", InvoiceSourceIdSchema),
  invoiceSource: codec("InvoiceSourceSchema", InvoiceSourceSchema),
  matchField: codec("MatchFieldSchema", MatchFieldSchema),
  matchType: codec("MatchTypeSchema", MatchTypeSchema),
  memberId: codec("MemberIdSchema", MemberIdSchema),
  member: codec("MemberSchema", MemberSchema),
  merchantAlias: codec("MerchantAliasSchema", MerchantAliasSchema),
  minorUnits: codec("MinorUnitsSchema", MinorUnitsSchema),
  money: codec("MoneySchema", MoneySchema),
  payeeId: codec("PayeeIdSchema", PayeeIdSchema),
  payeeKind: codec("PayeeKindSchema", PayeeKindSchema),
  payee: codec("PayeeSchema", PayeeSchema),
  pendingHolding: codec("PendingHoldingSchema", PendingHoldingSchema),
  platformId: codec("PlatformIdSchema", PlatformIdSchema),
  pricedHolding: codec("PricedHoldingSchema", PricedHoldingSchema),
  profileId: codec("ProfileIdSchema", ProfileIdSchema),
  profileKind: codec("ProfileKindSchema", ProfileKindSchema),
  profile: codec("ProfileSchema", ProfileSchema),
  providerAccountId: codec("ProviderAccountIdSchema", ProviderAccountIdSchema),
  providerAccount: codec("ProviderAccountSchema", ProviderAccountSchema),
  providerId: codec("ProviderIdSchema", ProviderIdSchema),
  providerKind: codec("ProviderKindSchema", ProviderKindSchema),
  provider: codec("ProviderSchema", ProviderSchema),
  quantity: codec("QuantitySchema", QuantitySchema),
  rate: codec("RateSchema", RateSchema),
  reportId: codec("ReportIdSchema", ReportIdSchema),
  report: codec("ReportSchema", ReportSchema),
  role: codec("RoleSchema", RoleSchema),
  ruleDirection: codec("RuleDirectionSchema", RuleDirectionSchema),
  ruleId: codec("RuleIdSchema", RuleIdSchema),
  rule: codec("RuleSchema", RuleSchema),
  sameCurrencyAmount: codec(
    "SameCurrencyAmountSchema",
    SameCurrencyAmountSchema
  ),
  spendingType: codec("SpendingTypeSchema", SpendingTypeSchema),
  subscriptionId: codec("SubscriptionIdSchema", SubscriptionIdSchema),
  subscription: codec("SubscriptionSchema", SubscriptionSchema),
  subscriptionStatus: codec(
    "SubscriptionStatusSchema",
    SubscriptionStatusSchema
  ),
  syncCounts: codec("SyncCountsSchema", SyncCountsSchema),
  syncRunId: codec("SyncRunIdSchema", SyncRunIdSchema),
  syncRunKind: codec("SyncRunKindSchema", SyncRunKindSchema),
  syncRun: codec("SyncRunSchema", SyncRunSchema),
  syncRunState: codec("SyncRunStateSchema", SyncRunStateSchema),
  taxObligationId: codec("TaxObligationIdSchema", TaxObligationIdSchema),
  taxObligation: codec("TaxObligationSchema", TaxObligationSchema),
  taxObligationStatus: codec(
    "TaxObligationStatusSchema",
    TaxObligationStatusSchema
  ),
  taxProfileId: codec("TaxProfileIdSchema", TaxProfileIdSchema),
  taxProfile: codec("TaxProfileSchema", TaxProfileSchema),
  timestamp: codec("TimestampSchema", TimestampSchema),
  transactionId: codec("TransactionIdSchema", TransactionIdSchema),
  transaction: codec("TransactionSchema", TransactionSchema),
} as const;
