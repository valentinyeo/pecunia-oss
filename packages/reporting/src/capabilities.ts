import { CurrentPerson } from "@pecunia/access";
import { implement } from "@pecunia/capability/implement";
import { Effect } from "effect";

import {
  incomeSummaryContract,
  listMonthsContract,
  monthlyTotalsContract,
  readCategoriesContract,
  readCategoryPaymentsContract,
  readDashboardContract,
  readIncomeContract,
  readMonthContract,
  readSpendingContract,
  spendingSummaryContract,
} from "./contracts.js";
import { readScopeOf } from "./scope.js";
import { ReportService } from "./service.js";

export const readDashboard = implement(
  readDashboardContract,
  ({ period, profileId }) =>
    Effect.gen(function* readProfileDashboard() {
      const person = yield* CurrentPerson;
      const scope = yield* readScopeOf(person, profileId);
      const service = yield* ReportService;

      return yield* service.dashboard(scope, period);
    })
);

export const readCategories = implement(
  readCategoriesContract,
  ({ period, profileId }) =>
    Effect.gen(function* readProfileCategories() {
      const person = yield* CurrentPerson;
      const scope = yield* readScopeOf(person, profileId);
      const service = yield* ReportService;

      return yield* service.categoryReport(scope, period);
    })
);

export const readSpending = implement(
  readSpendingContract,
  ({ period, profileId }) =>
    Effect.gen(function* readProfileSpending() {
      const person = yield* CurrentPerson;
      const scope = yield* readScopeOf(person, profileId);
      const service = yield* ReportService;

      return yield* service.spending(scope, period);
    })
);

export const readCategoryPayments = implement(
  readCategoryPaymentsContract,
  ({ categoryId, period, profileId }) =>
    Effect.gen(function* readProfileCategoryPayments() {
      const person = yield* CurrentPerson;
      const scope = yield* readScopeOf(person, profileId);
      const service = yield* ReportService;

      return yield* service.categoryPayments(scope, period, categoryId);
    })
);

export const readIncome = implement(
  readIncomeContract,
  ({ clientId, period, profileId }) =>
    Effect.gen(function* readProfileIncome() {
      const person = yield* CurrentPerson;
      const scope = yield* readScopeOf(person, profileId);
      const service = yield* ReportService;

      return yield* service.income(scope, period, clientId);
    })
);

export const readMonth = implement(readMonthContract, ({ month, profileId }) =>
  Effect.gen(function* readProfileMonth() {
    const person = yield* CurrentPerson;
    const scope = yield* readScopeOf(person, profileId);
    const service = yield* ReportService;

    return yield* service.monthReport(scope, month);
  })
);

export const listMonths = implement(listMonthsContract, ({ profileId }) =>
  Effect.gen(function* listProfileMonths() {
    const person = yield* CurrentPerson;
    const scope = yield* readScopeOf(person, profileId);
    const service = yield* ReportService;

    return yield* service.months(scope);
  })
);

export const spendingSummary = implement(
  spendingSummaryContract,
  ({ bound, profileId }) =>
    Effect.gen(function* summariseProfileSpending() {
      const person = yield* CurrentPerson;
      const scope = yield* readScopeOf(person, profileId);
      const service = yield* ReportService;

      return yield* service.spendingSummary(scope, bound);
    })
);

export const incomeSummary = implement(
  incomeSummaryContract,
  ({ bound, profileId }) =>
    Effect.gen(function* summariseProfileIncome() {
      const person = yield* CurrentPerson;
      const scope = yield* readScopeOf(person, profileId);
      const service = yield* ReportService;

      return yield* service.incomeSummary(scope, bound);
    })
);

export const monthlyTotals = implement(
  monthlyTotalsContract,
  ({ bound, profileId }) =>
    Effect.gen(function* summariseProfileMonths() {
      const person = yield* CurrentPerson;
      const scope = yield* readScopeOf(person, profileId);
      const service = yield* ReportService;

      return yield* service.monthlyTotals(scope, bound);
    })
);

export const reportCapabilities = [
  readDashboard,
  readCategories,
  readSpending,
  readCategoryPayments,
  readIncome,
  readMonth,
  listMonths,
  spendingSummary,
  incomeSummary,
  monthlyTotals,
] as const;

export const reportToolCapabilities = [
  spendingSummary,
  incomeSummary,
  monthlyTotals,
] as const;
