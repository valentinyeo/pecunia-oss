import { Schema } from "effect";

export const CurrencyCodeSchema = Schema.String.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
).pipe(Schema.brand("CurrencyCode"));

export type CurrencyCode = typeof CurrencyCodeSchema.Type;

export const MinorUnitsSchema = Schema.Int.check(
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an integer a number holds exactly",
  })
).pipe(Schema.brand("MinorUnits"));

export type MinorUnits = typeof MinorUnitsSchema.Type;

export const MoneySchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
}).pipe(Schema.brand("Money"));

export type Money = typeof MoneySchema.Type;

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const monthLength = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (monthLengths[month - 1] ?? 0);

const isCalendarDate = (text: string): boolean => {
  const [year = 0, month = 0, day = 0] = text.split("-").map(Number);

  return (
    month >= 1 && month <= 12 && day >= 1 && day <= monthLength(year, month)
  );
};

export const DateOnlySchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(isCalendarDate, {
    expected: "a calendar date that exists",
  })
).pipe(Schema.brand("DateOnly"));

export type DateOnly = typeof DateOnlySchema.Type;

export const YearMonthSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-(?:0[1-9]|1[0-2])$/u)
).pipe(Schema.brand("YearMonth"));

export type YearMonth = typeof YearMonthSchema.Type;

const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const TimestampSchema = Schema.String.check(
  Schema.isPattern(timestampPattern)
).pipe(Schema.brand("Timestamp"));

export type Timestamp = typeof TimestampSchema.Type;

export const ProfileIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("ProfileId")
);

export type ProfileId = typeof ProfileIdSchema.Type;

export const CategoryIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("CategoryId")
);

export type CategoryId = typeof CategoryIdSchema.Type;

export const PayeeIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("PayeeId")
);

export type PayeeId = typeof PayeeIdSchema.Type;

export const TransactionIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("TransactionId")
);

export type TransactionId = typeof TransactionIdSchema.Type;

export const ProviderAccountIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("ProviderAccountId")
);

export type ProviderAccountId = typeof ProviderAccountIdSchema.Type;

export const DirectionSchema = Schema.Literals(["in", "neutral", "out"]);

export type Direction = typeof DirectionSchema.Type;

export const SpendingTypeSchema = Schema.Literals([
  "business",
  "mixed",
  "personal",
]);

export type SpendingType = typeof SpendingTypeSchema.Type;

export const SpendBucketSchema = Schema.Literals([
  "business",
  "mixed",
  "personal",
  "uncategorised",
]);

export type SpendBucket = typeof SpendBucketSchema.Type;

export const AccountKindSchema = Schema.Literals([
  "brokerage",
  "current",
  "jar",
  "savings",
]);

export type AccountKind = typeof AccountKindSchema.Type;

export const ShareBasisPointsSchema = Schema.Int.pipe(
  Schema.brand("ShareBasisPoints")
);

export type ShareBasisPoints = typeof ShareBasisPointsSchema.Type;

export const PeriodChoiceSchema = Schema.TaggedUnion({
  All: {},
  Day: {},
  Month: {},
  NamedMonth: { month: YearMonthSchema },
  Quarter: {},
  Week: {},
  Year: {},
});

export type PeriodChoice = typeof PeriodChoiceSchema.Type;

const insideRange = (range: {
  readonly from: DateOnly;
  readonly to: DateOnly;
}) => range.from <= range.to;

export const BoundSchema = Schema.Union([
  Schema.TaggedStruct("All", {}),
  Schema.TaggedStruct("Between", {
    from: DateOnlySchema,
    to: DateOnlySchema,
  }).check(
    Schema.makeFilter(insideRange, {
      expected: "a start date no later than the end date",
    })
  ),
]).pipe(Schema.toTaggedUnion("_tag"));

export type Bound = typeof BoundSchema.Type;

export const PeriodSchema = Schema.Struct({
  bound: BoundSchema,
  choice: PeriodChoiceSchema,
});

export type Period = typeof PeriodSchema.Type;

const consistentTotals = (totals: {
  readonly incomeMinor: number;
  readonly moneyInMinor: number;
  readonly moneyOutMinor: number;
  readonly netMinor: number;
  readonly otherInMinor: number;
  readonly refundMinor: number;
  readonly spendMinor: number;
  readonly taxMinor: number;
}) =>
  totals.moneyInMinor ===
    totals.incomeMinor + totals.otherInMinor + totals.refundMinor &&
  totals.moneyOutMinor === totals.spendMinor + totals.taxMinor &&
  totals.netMinor === totals.moneyInMinor - totals.moneyOutMinor;

export const TotalsSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  incomeMinor: MinorUnitsSchema,
  moneyInMinor: MinorUnitsSchema,
  moneyOutMinor: MinorUnitsSchema,
  netMinor: MinorUnitsSchema,
  otherInMinor: MinorUnitsSchema,
  refundMinor: MinorUnitsSchema,
  spendMinor: MinorUnitsSchema,
  taxMinor: MinorUnitsSchema,
}).check(
  Schema.makeFilter(consistentTotals, {
    expected:
      "totals whose parts add up: in is income, other and refunds; out is spend and tax; net is in minus out",
  })
);

export type Totals = typeof TotalsSchema.Type;

export const CurrencySpendSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  spendMinor: MinorUnitsSchema,
});

export type CurrencySpend = typeof CurrencySpendSchema.Type;

export const DailySpendSchema = Schema.Struct({
  date: DateOnlySchema,
  spendMinor: MinorUnitsSchema,
});

export type DailySpend = typeof DailySpendSchema.Type;

export const PayeeLabelSchema = Schema.OptionFromNullishOr(Schema.String);

const categoryRows = Schema.Union([
  Schema.TaggedStruct("Categorised", {
    categoryId: CategoryIdSchema,
    name: Schema.String,
  }),
  Schema.TaggedStruct("Uncategorised", {}),
]).pipe(Schema.toTaggedUnion("_tag"));

export const CategoryReferenceSchema = categoryRows;

export type CategoryReference = typeof CategoryReferenceSchema.Type;

export const CategorySpendSchema = Schema.Struct({
  category: CategoryReferenceSchema,
  shareBasisPoints: ShareBasisPointsSchema,
  spendMinor: MinorUnitsSchema,
});

export type CategorySpend = typeof CategorySpendSchema.Type;

export const PaymentSchema = Schema.Struct({
  amount: MoneySchema,
  category: CategoryReferenceSchema,
  direction: DirectionSchema,
  id: TransactionIdSchema,
  merchant: Schema.String,
  occurredAt: TimestampSchema,
  payeeName: PayeeLabelSchema,
  reference: Schema.String,
});

export type Payment = typeof PaymentSchema.Type;

export const MerchantSpendSchema = Schema.Struct({
  merchant: Schema.String,
  repeatCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  spendMinor: MinorUnitsSchema,
});

export type MerchantSpend = typeof MerchantSpendSchema.Type;

export const RepeatPaymentSchema = Schema.Struct({
  merchant: Schema.String,
  payments: Schema.Int.check(Schema.isGreaterThanOrEqualTo(2)),
  spendMinor: MinorUnitsSchema,
});

export type RepeatPayment = typeof RepeatPaymentSchema.Type;

export const SpendSplitSchema = Schema.Struct({
  bucket: SpendBucketSchema,
  shareBasisPoints: ShareBasisPointsSchema,
  spendMinor: MinorUnitsSchema,
});

export type SpendSplit = typeof SpendSplitSchema.Type;

export const StackedMonthSchema = Schema.Struct({
  month: YearMonthSchema,
  rows: Schema.Array(
    Schema.Struct({
      category: CategoryReferenceSchema,
      spendMinor: MinorUnitsSchema,
    })
  ),
  totalMinor: MinorUnitsSchema,
});

export type StackedMonth = typeof StackedMonthSchema.Type;

export const ClientRecordSchema = Schema.Struct({
  name: Schema.String,
  payeeId: PayeeIdSchema,
});

export type ClientRecord = typeof ClientRecordSchema.Type;

export const ClientMonthSchema = Schema.Struct({
  incomeMinor: MinorUnitsSchema,
  month: YearMonthSchema,
});

export type ClientMonth = typeof ClientMonthSchema.Type;

export const ClientIncomeSchema = Schema.Struct({
  client: ClientRecordSchema,
  incomeMinor: MinorUnitsSchema,
  months: Schema.Array(ClientMonthSchema),
  shareBasisPoints: ShareBasisPointsSchema,
});

export type ClientIncome = typeof ClientIncomeSchema.Type;

export const MonthTotalsSchema = Schema.Struct({
  month: YearMonthSchema,
  totals: TotalsSchema,
});

export type MonthTotals = typeof MonthTotalsSchema.Type;

export const MonthStatementSchema = Schema.Struct({
  dailySpend: Schema.Array(DailySpendSchema),
  merchants: Schema.Array(MerchantSpendSchema),
  month: YearMonthSchema,
  payments: Schema.Array(PaymentSchema),
  repeatPayments: Schema.Array(RepeatPaymentSchema),
  spendByCategory: Schema.Array(CategorySpendSchema),
  totals: TotalsSchema,
});

export type MonthStatement = typeof MonthStatementSchema.Type;

export const AccountBalanceSchema = Schema.Struct({
  accountId: ProviderAccountIdSchema,
  balance: MoneySchema,
  kind: AccountKindSchema,
  name: Schema.NonEmptyString,
});

export type AccountBalance = typeof AccountBalanceSchema.Type;

export const BalanceRowSchema = Schema.Struct({
  accountId: ProviderAccountIdSchema,
  amount: MoneySchema,
  kind: AccountKindSchema,
  name: Schema.NonEmptyString,
});

export type BalanceRow = typeof BalanceRowSchema.Type;

export const TotalBalanceSchema = Schema.Struct({
  accounts: Schema.Array(BalanceRowSchema),
  currency: CurrencyCodeSchema,
  totalMinor: MinorUnitsSchema,
});

export type TotalBalance = typeof TotalBalanceSchema.Type;

const forecastRunning = Schema.TaggedStruct("Running", {
  averageDailyMinor: MinorUnitsSchema,
  elapsedDays: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  month: YearMonthSchema,
  projectedRemainderMinor: MinorUnitsSchema,
  projectedSpendMinor: MinorUnitsSchema,
  spendMinor: MinorUnitsSchema,
  totalDays: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});

const forecastStates = Schema.Union([
  Schema.TaggedStruct("Pending", { month: YearMonthSchema }),
  Schema.TaggedStruct("Closed", {
    month: YearMonthSchema,
    spendMinor: MinorUnitsSchema,
  }),
  forecastRunning,
]).pipe(Schema.toTaggedUnion("_tag"));

export const ForecastSchema = forecastStates;

export type Forecast = typeof ForecastSchema.Type;

export const DashboardSchema = Schema.Struct({
  balance: TotalBalanceSchema,
  dailySpend: Schema.Array(DailySpendSchema),
  forecast: ForecastSchema,
  period: PeriodSchema,
  recentPayments: Schema.Array(PaymentSchema),
  spendByCurrency: Schema.Array(CurrencySpendSchema),
  taxOwed: MoneySchema,
  totals: TotalsSchema,
});

export type Dashboard = typeof DashboardSchema.Type;

export const CategoryReportSchema = Schema.Struct({
  categories: Schema.Array(CategorySpendSchema),
  categoryCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  period: PeriodSchema,
  totals: TotalsSchema,
  uncategorisedMinor: MinorUnitsSchema,
});

export type CategoryReport = typeof CategoryReportSchema.Type;

export const SpendingReportSchema = Schema.Struct({
  categories: Schema.Array(CategorySpendSchema),
  period: PeriodSchema,
  split: Schema.Array(SpendSplitSchema),
  stackedMonths: Schema.Array(StackedMonthSchema),
  totals: TotalsSchema,
});

export type SpendingReport = typeof SpendingReportSchema.Type;

export const IncomeReportSchema = Schema.Struct({
  clients: Schema.Array(ClientIncomeSchema),
  period: PeriodSchema,
  refundMinor: MinorUnitsSchema,
  totals: TotalsSchema,
});

export type IncomeReport = typeof IncomeReportSchema.Type;

export const CategoryPaymentsSchema = Schema.Struct({
  category: CategoryReferenceSchema,
  period: PeriodSchema,
  payments: Schema.Array(PaymentSchema),
  spendMinor: MinorUnitsSchema,
});

export type CategoryPayments = typeof CategoryPaymentsSchema.Type;

export const MonthListSchema = Schema.Struct({
  months: Schema.Array(YearMonthSchema),
});

export type MonthList = typeof MonthListSchema.Type;

export const SpendingSummarySchema = Schema.Struct({
  bound: BoundSchema,
  categories: Schema.Array(CategorySpendSchema),
  currency: CurrencyCodeSchema,
  spendMinor: MinorUnitsSchema,
});

export type SpendingSummary = typeof SpendingSummarySchema.Type;

export const IncomeSummarySchema = Schema.Struct({
  bound: BoundSchema,
  clients: Schema.Array(ClientIncomeSchema),
  currency: CurrencyCodeSchema,
  incomeMinor: MinorUnitsSchema,
  refundMinor: MinorUnitsSchema,
});

export type IncomeSummary = typeof IncomeSummarySchema.Type;

export const MonthlyTotalsSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  months: Schema.Array(MonthTotalsSchema),
});

export type MonthlyTotals = typeof MonthlyTotalsSchema.Type;

export const PeriodRequestSchema = Schema.Struct({
  period: PeriodChoiceSchema,
  profileId: ProfileIdSchema,
});

export type PeriodRequest = typeof PeriodRequestSchema.Type;

export const ClientRequestSchema = Schema.Struct({
  clientId: Schema.OptionFromNullishOr(PayeeIdSchema),
  period: PeriodChoiceSchema,
  profileId: ProfileIdSchema,
});

export type ClientRequest = typeof ClientRequestSchema.Type;

export const CategoryRequestSchema = Schema.Struct({
  categoryId: CategoryIdSchema,
  period: PeriodChoiceSchema,
  profileId: ProfileIdSchema,
});

export type CategoryRequest = typeof CategoryRequestSchema.Type;

export const MonthRequestSchema = Schema.Struct({
  month: YearMonthSchema,
  profileId: ProfileIdSchema,
});

export type MonthRequest = typeof MonthRequestSchema.Type;

export const ProfileRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type ProfileRequest = typeof ProfileRequestSchema.Type;

export const RangeRequestSchema = Schema.Struct({
  bound: BoundSchema,
  profileId: ProfileIdSchema,
});

export type RangeRequest = typeof RangeRequestSchema.Type;
