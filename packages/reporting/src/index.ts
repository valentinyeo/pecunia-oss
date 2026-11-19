export {
  addDays,
  boundOf,
  dateOf,
  dayCountOf,
  daysBetween,
  daysOfBound,
  endOfMonth,
  monthBound,
  monthLength,
  monthOfDate,
  monthsBetween,
  monthsOfBound,
  ordinalOf,
  resolvePeriod,
  startOfMonth,
  startOfWeek,
  withinBound,
} from "./date.js";

export {
  AmountNotRepresentable,
  CategoryCycle,
  MixedCurrency,
  RateMissing,
  ReportContractFailureSchema,
  ReportFailureSchema,
  ReportOverflow,
  ReportSourceError,
  UnknownCategory,
  UnknownClient,
} from "./errors.js";

export type { ReportContractFailure, ReportFailure } from "./errors.js";

export {
  baseOf,
  categoryReferenceOf,
  countedFlows,
  dailySpend,
  flowKindOf,
  flowsIn,
  flowsOf,
  merchantOf,
  monthTotalsOf,
  monthsHeld,
  paymentOf,
  paymentsOf,
  spendByCurrency,
  spendFlows,
  spanOf,
  totalsOf,
} from "./flows.js";

export type { Flow, FlowKind } from "./flows.js";

export {
  categorisedIdOf,
  categoryCountOf,
  categoryRowsOf,
  categoryTreeOf,
  descendantsOf,
  namesOf,
  rolledSpendOf,
  spendSplitOf,
  stackedMonthsOf,
  uncategorisedOf,
} from "./categories.js";

export type { CategoryTree } from "./categories.js";

export { incomeClientIdOf, incomeRowsOf } from "./income.js";

export {
  merchantRowsOf,
  repeatPaymentsOf,
  TOP_MERCHANT_LIMIT,
} from "./merchants.js";

export { forecastOf } from "./forecast.js";

export { taxOwedOf, totalBalanceOf } from "./balance.js";

export type { BalanceFailure } from "./balance.js";

export { allocateShares } from "./shares.js";

export type { Share, ShareTarget } from "./shares.js";

export {
  minorOf,
  minorOrOverflow,
  moneyOf,
  roundHalfAwayFromZero,
  shareOf,
  sumOf,
  zeroShare,
} from "./money.js";

export {
  AccountBalanceSchema,
  AccountKindSchema,
  BoundSchema,
  CategoryPaymentsSchema,
  CategoryReferenceSchema,
  CategoryReportSchema,
  CategorySpendSchema,
  ClientIncomeSchema,
  ClientRecordSchema,
  CurrencyCodeSchema,
  CurrencySpendSchema,
  DailySpendSchema,
  DashboardSchema,
  DateOnlySchema,
  ForecastSchema,
  IncomeReportSchema,
  IncomeSummarySchema,
  MerchantSpendSchema,
  MinorUnitsSchema,
  MoneySchema,
  MonthListSchema,
  MonthStatementSchema,
  MonthTotalsSchema,
  MonthlyTotalsSchema,
  PayeeIdSchema,
  PaymentSchema,
  PeriodChoiceSchema,
  PeriodSchema,
  ProfileIdSchema,
  RepeatPaymentSchema,
  ShareBasisPointsSchema,
  SpendBucketSchema,
  SpendingTypeSchema,
  SpendingReportSchema,
  SpendingSummarySchema,
  SpendSplitSchema,
  StackedMonthSchema,
  TimestampSchema,
  TotalsSchema,
  YearMonthSchema,
} from "./model.js";

export type {
  AccountBalance,
  AccountKind,
  BalanceRow,
  Bound,
  CategoryId,
  CategoryPayments,
  CategoryReference,
  CategoryReport,
  CategorySpend,
  ClientIncome,
  ClientMonth,
  ClientRecord,
  CurrencyCode,
  CurrencySpend,
  DailySpend,
  Dashboard,
  DateOnly,
  Direction,
  Forecast,
  IncomeReport,
  IncomeSummary,
  MerchantSpend,
  MinorUnits,
  Money,
  MonthList,
  MonthStatement,
  MonthTotals,
  MonthlyTotals,
  PayeeId,
  Payment,
  Period,
  PeriodChoice,
  ProfileId,
  ProviderAccountId,
  RepeatPayment,
  ShareBasisPoints,
  SpendBucket,
  SpendingReport,
  SpendingSummary,
  SpendingType,
  SpendSplit,
  StackedMonth,
  Timestamp,
  TotalBalance,
  Totals,
  TransactionId,
  YearMonth,
} from "./model.js";

export { ReportSource } from "./source.js";

export { readScopeOf, ReadScopeSchema } from "./scope.js";

export type { ReadScope } from "./scope.js";

export { RECENT_PAYMENT_LIMIT, ReportService } from "./service.js";

export {
  incomeSummaryContract,
  listMonthsContract,
  monthlyTotalsContract,
  readCategoriesContract,
  readCategoryPaymentsContract,
  readDashboardContract,
  readIncomeContract,
  readMonthContract,
  readSpendingContract,
  reportContracts,
  spendingSummaryContract,
  toolContracts,
} from "./contracts.js";

export {
  incomeSummary,
  listMonths,
  monthlyTotals,
  readCategories,
  readCategoryPayments,
  readDashboard,
  readIncome,
  readMonth,
  readSpending,
  reportCapabilities,
  reportToolCapabilities,
  spendingSummary,
} from "./capabilities.js";

export { memoryReportSourceLayer } from "./memory.js";

export type {
  MemoryRate,
  MemoryReportBook,
  MemoryReportSeed,
} from "./memory.js";
