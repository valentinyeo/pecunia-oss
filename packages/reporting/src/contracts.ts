import { defineContract } from "@pecunia/capability/contract";

import { ReportContractFailureSchema } from "./errors.js";
import {
  CategoryPaymentsSchema,
  CategoryReportSchema,
  CategoryRequestSchema,
  ClientRequestSchema,
  DashboardSchema,
  IncomeReportSchema,
  IncomeSummarySchema,
  MonthListSchema,
  MonthRequestSchema,
  MonthStatementSchema,
  MonthlyTotalsSchema,
  PeriodRequestSchema,
  ProfileRequestSchema,
  RangeRequestSchema,
  SpendingReportSchema,
  SpendingSummarySchema,
} from "./model.js";

const readOnly = { idempotent: true, readOnly: true } as const;

export const readDashboardContract = defineContract("readDashboard", {
  annotations: readOnly,
  description:
    "Every number on the front page for one period: money in, money out and the net; spend split by the currency it was paid in; a daily spend series; the most recent payments; the total balance of every account converted to the book's base currency; tax still owed from the accounting provider; and the month's projected spend from the days elapsed so far. Amounts are integer minor units in the book's base currency.",
  failure: ReportContractFailureSchema,
  input: PeriodRequestSchema,
  output: DashboardSchema,
});

export const readCategoriesContract = defineContract("readCategories", {
  annotations: readOnly,
  description:
    "Spend per category for one period, with each root category's share of the period's spend in basis points. A parent category carries its children's spend, so the rows add up to the period's spend exactly once. The count is the profile's live categories.",
  failure: ReportContractFailureSchema,
  input: PeriodRequestSchema,
  output: CategoryReportSchema,
});

export const readSpendingContract = defineContract("readSpending", {
  annotations: readOnly,
  description:
    "Spending for one period: personal, business and mixed spend with their shares; the same spend by category for a doughnut; and a stacked month-by-month series for the trend. The parent rule holds in every total, and the shares of a non-zero total add up to 10000 basis points.",
  failure: ReportContractFailureSchema,
  input: PeriodRequestSchema,
  output: SpendingReportSchema,
});

export const readCategoryPaymentsContract = defineContract(
  "readCategoryPayments",
  {
    annotations: readOnly,
    description:
      "One category's spend payments for a period, newest first. Asking for a parent category returns its children's payments too, so the list matches the category total. Tagging a payment as reviewed stays with the bank line contract that owns the review state.",
    failure: ReportContractFailureSchema,
    input: CategoryRequestSchema,
    output: CategoryPaymentsSchema,
  }
);

export const readIncomeContract = defineContract("readIncome", {
  annotations: readOnly,
  description:
    "Income for one period, grouped by client and never by merchant text. A client comes from the typed client link the rules put on the classification, which the transfer reference resolves and the merchant never does. Refunds are counted apart from income. Pass a client id to narrow the report to that client; the monthly series is dense, so a month with no income is a row of zero.",
  failure: ReportContractFailureSchema,
  input: ClientRequestSchema,
  output: IncomeReportSchema,
});

export const readMonthContract = defineContract("readMonth", {
  annotations: readOnly,
  description:
    "One month's statement: totals, spend by category, a daily spend series for every day of the month, the top merchants, the merchants paid more than once, and every counted payment of the month newest first.",
  failure: ReportContractFailureSchema,
  input: MonthRequestSchema,
  output: MonthStatementSchema,
});

export const listMonthsContract = defineContract("listMonths", {
  annotations: readOnly,
  description:
    "The months the book already holds, newest first, from the posted transactions.",
  failure: ReportContractFailureSchema,
  input: ProfileRequestSchema,
  output: MonthListSchema,
});

export const spendingSummaryContract = defineContract("spendingSummary", {
  annotations: readOnly,
  description:
    "An agent asks for spend by category over an explicit date range, with each category's share of the range's spend. A parent category carries its children. The range is inclusive and carries both dates, or neither for the whole book.",
  failure: ReportContractFailureSchema,
  input: RangeRequestSchema,
  output: SpendingSummarySchema,
});

export const incomeSummaryContract = defineContract("incomeSummary", {
  annotations: readOnly,
  description:
    "An agent asks for income by client over an explicit date range. Refunds stay separate from income, and each income row carries the client link rather than the merchant text.",
  failure: ReportContractFailureSchema,
  input: RangeRequestSchema,
  output: IncomeSummarySchema,
});

export const monthlyTotalsContract = defineContract("monthlyTotals", {
  annotations: readOnly,
  description:
    "An agent asks for month by month money in, money out and the net over an explicit date range. Every month of the range is present, and the months are in calendar order.",
  failure: ReportContractFailureSchema,
  input: RangeRequestSchema,
  output: MonthlyTotalsSchema,
});

export const reportContracts = [
  readDashboardContract,
  readCategoriesContract,
  readSpendingContract,
  readCategoryPaymentsContract,
  readIncomeContract,
  readMonthContract,
  listMonthsContract,
  spendingSummaryContract,
  incomeSummaryContract,
  monthlyTotalsContract,
] as const;

export const toolContracts = [
  spendingSummaryContract,
  incomeSummaryContract,
  monthlyTotalsContract,
] as const;
