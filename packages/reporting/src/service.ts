import type { Payee, RateLookup } from "@pecunia/core/model";
import { Context, Effect, Layer, Match, Option } from "effect";

import { taxOwedOf, totalBalanceOf } from "./balance.js";
import {
  categorisedIdOf,
  categoryCountOf,
  categoryRowsOf,
  categoryTreeOf,
  descendantsOf,
  namesOf,
  spendSplitOf,
  stackedMonthsOf,
  uncategorisedOf,
} from "./categories.js";
import {
  endOfMonth,
  monthBound,
  monthOfDate,
  monthsOfBound,
  resolvePeriod,
  startOfMonth,
} from "./date.js";
import { unknownCategoryOf } from "./errors.js";
import type { ReportContractFailure } from "./errors.js";
import {
  dailySpend,
  flowsIn,
  flowsOf,
  monthTotalsOf,
  monthsHeld,
  paymentsOf,
  spanOf,
  spendByCurrency,
  spendFlows,
  totalsOf,
} from "./flows.js";
import type { Flow } from "./flows.js";
import { forecastOf } from "./forecast.js";
import { incomeRowsOf } from "./income.js";
import {
  merchantRowsOf,
  repeatPaymentsOf,
  TOP_MERCHANT_LIMIT,
} from "./merchants.js";
import type {
  Bound,
  CategoryId,
  CategoryPayments,
  CategoryReport,
  Dashboard,
  DateOnly,
  IncomeReport,
  IncomeSummary,
  MonthList,
  MonthStatement,
  MonthlyTotals,
  PayeeId,
  Period,
  PeriodChoice,
  SpendingReport,
  SpendingSummary,
  YearMonth,
} from "./model.js";
import { CategoryReferenceSchema } from "./model.js";
import { minorOrOverflow } from "./money.js";
import type { ReadScope } from "./scope.js";
import { ReportSource } from "./source.js";

export const RECENT_PAYMENT_LIMIT = 5;

const REPEAT_PAYMENT_LIMIT = 5;

const periodOf = (choice: PeriodChoice, today: DateOnly): Period => ({
  bound: resolvePeriod(choice, today),
  choice,
});

const spanOfBound = (
  bound: Bound,
  flows: readonly Flow[]
): Option.Option<{ readonly from: DateOnly; readonly to: DateOnly }> =>
  Match.value(bound).pipe(
    Match.tag("All", () => spanOf(flows)),
    Match.tag("Between", ({ from, to }) => Option.some({ from, to })),
    Match.exhaustive
  );

const monthsOfPeriod = (
  bound: Bound,
  flows: readonly Flow[]
): readonly YearMonth[] =>
  Match.value(bound).pipe(
    Match.tag("All", () => [...monthsHeld(flows)].toReversed()),
    Match.tag("Between", () => monthsOfBound(bound)),
    Match.exhaustive
  );

const summaryMonthsOf = (bound: Bound): readonly YearMonth[] =>
  Match.value(bound).pipe(
    Match.tag("All", () => []),
    Match.tag("Between", () => monthsOfBound(bound)),
    Match.exhaustive
  );

const byMonth = (flows: readonly Flow[], month: YearMonth): readonly Flow[] =>
  flows.filter((flow) => monthOfDate(flow.transaction.valueDate) === month);

export class ReportService extends Context.Service<
  ReportService,
  {
    readonly categoryPayments: (
      scope: ReadScope,
      choice: PeriodChoice,
      categoryId: CategoryId
    ) => Effect.Effect<CategoryPayments, ReportContractFailure>;
    readonly categoryReport: (
      scope: ReadScope,
      choice: PeriodChoice
    ) => Effect.Effect<CategoryReport, ReportContractFailure>;
    readonly dashboard: (
      scope: ReadScope,
      choice: PeriodChoice
    ) => Effect.Effect<Dashboard, ReportContractFailure>;
    readonly income: (
      scope: ReadScope,
      choice: PeriodChoice,
      client: Option.Option<PayeeId>
    ) => Effect.Effect<IncomeReport, ReportContractFailure>;
    readonly incomeSummary: (
      scope: ReadScope,
      bound: Bound
    ) => Effect.Effect<IncomeSummary, ReportContractFailure>;
    readonly monthReport: (
      scope: ReadScope,
      month: YearMonth
    ) => Effect.Effect<MonthStatement, ReportContractFailure>;
    readonly monthlyTotals: (
      scope: ReadScope,
      bound: Bound
    ) => Effect.Effect<MonthlyTotals, ReportContractFailure>;
    readonly months: (
      scope: ReadScope
    ) => Effect.Effect<MonthList, ReportContractFailure>;
    readonly spending: (
      scope: ReadScope,
      choice: PeriodChoice
    ) => Effect.Effect<SpendingReport, ReportContractFailure>;
    readonly spendingSummary: (
      scope: ReadScope,
      bound: Bound
    ) => Effect.Effect<SpendingSummary, ReportContractFailure>;
  }
>()("@pecunia/reporting/ReportService", {
  make: Effect.gen(function* makeReportService() {
    const source = yield* ReportSource;

    const load = Effect.fn("ReportService.load")(function* load(
      scope: ReadScope
    ) {
      const currency = yield* source.baseCurrency(scope.profileId);
      const categories = yield* source.categories(scope.profileId);
      const transactions = yield* source.transactions(scope.profileId);
      const payees = yield* source.payees(scope.profileId);
      const accounts = yield* source.accounts(scope.profileId);
      const obligations = yield* source.obligations(scope.profileId);
      const today = yield* source.today(scope.profileId);
      const flows = yield* flowsOf(transactions, currency);
      const tree = yield* categoryTreeOf(categories);
      const names = namesOf(categories);

      const payeeNames = new Map<string, string>(
        payees.map((payee: Payee) => [payee.id, payee.name])
      );

      return {
        accounts,
        categories,
        currency,
        flows,
        names,
        obligations,
        payees: payeeNames,
        today,
        tree,
      };
    });

    const ratesOf = (scope: ReadScope): RateLookup =>
      source.rates(scope.profileId);

    const dashboard = Effect.fn("ReportService.dashboard")(function* dashboard(
      scope: ReadScope,
      choice: PeriodChoice
    ) {
      const book = yield* load(scope);
      const period = periodOf(choice, book.today);
      const flows = flowsIn(book.flows, period.bound);
      const totals = yield* totalsOf(flows, book.currency);
      const span = spanOfBound(period.bound, flows);
      const month = monthOfDate(book.today);

      const monthSpend = yield* totalsOf(
        byMonth(book.flows, month),
        book.currency
      );

      const daily = Option.isNone(span)
        ? []
        : yield* dailySpend(flows, span.value.from, span.value.to);

      return {
        balance: yield* totalBalanceOf(
          book.accounts,
          book.currency,
          ratesOf(scope)
        ),
        dailySpend: daily,
        forecast: yield* forecastOf(month, book.today, monthSpend.spendMinor),
        period,
        recentPayments: paymentsOf(flows, book.names, book.payees).slice(
          0,
          RECENT_PAYMENT_LIMIT
        ),
        spendByCurrency: yield* spendByCurrency(flows),
        taxOwed: yield* taxOwedOf(
          book.obligations,
          book.currency,
          ratesOf(scope)
        ),
        totals,
      };
    });

    const categoryReport = Effect.fn("ReportService.categoryReport")(
      function* categoryReport(scope: ReadScope, choice: PeriodChoice) {
        const book = yield* load(scope);
        const period = periodOf(choice, book.today);
        const flows = flowsIn(book.flows, period.bound);

        return {
          categories: yield* categoryRowsOf(book.tree, flows),
          categoryCount: categoryCountOf(book.categories),
          period,
          totals: yield* totalsOf(flows, book.currency),
          uncategorisedMinor: yield* minorOrOverflow(
            uncategorisedOf(flows),
            "uncategorised spend"
          ),
        };
      }
    );

    const spending = Effect.fn("ReportService.spending")(function* spending(
      scope: ReadScope,
      choice: PeriodChoice
    ) {
      const book = yield* load(scope);
      const period = periodOf(choice, book.today);
      const flows = flowsIn(book.flows, period.bound);
      const months = monthsOfPeriod(period.bound, flows);

      return {
        categories: yield* categoryRowsOf(book.tree, flows),
        period,
        split: yield* spendSplitOf(book.tree, flows),
        stackedMonths: yield* stackedMonthsOf(book.tree, flows, months),
        totals: yield* totalsOf(flows, book.currency),
      };
    });

    const income = Effect.fn("ReportService.income")(function* income(
      scope: ReadScope,
      choice: PeriodChoice,
      client: Option.Option<PayeeId>
    ) {
      const book = yield* load(scope);
      const period = periodOf(choice, book.today);
      const flows = flowsIn(book.flows, period.bound);
      const months = monthsOfPeriod(period.bound, flows);
      const totals = yield* totalsOf(flows, book.currency);

      return {
        clients: yield* incomeRowsOf(flows, book.payees, months, client),
        period,
        refundMinor: totals.refundMinor,
        totals,
      };
    });

    const categoryPayments = Effect.fn("ReportService.categoryPayments")(
      function* categoryPayments(
        scope: ReadScope,
        choice: PeriodChoice,
        categoryId: CategoryId
      ) {
        const book = yield* load(scope);
        const category = book.tree.byId.get(categoryId);

        if (category === undefined) {
          return yield* unknownCategoryOf(categoryId);
        }

        const period = periodOf(choice, book.today);
        const ids = new Set(descendantsOf(book.tree, categoryId));

        const flows = flowsIn(book.flows, period.bound).filter(
          (flow) =>
            flow.kind === "spend" &&
            Option.exists(
              categorisedIdOf(flow.transaction.categorization),
              (id) => ids.has(id)
            )
        );

        let spend = 0n;

        for (const flow of spendFlows(flows)) {
          spend += BigInt(flow.amount.minor);
        }

        return {
          category: CategoryReferenceSchema.cases.Categorised.make({
            categoryId,
            name: category.name,
          }),
          period,
          payments: paymentsOf(flows, book.names, book.payees),
          spendMinor: yield* minorOrOverflow(spend, "spend in the category"),
        };
      }
    );

    const monthReport = Effect.fn("ReportService.monthReport")(
      function* monthReport(scope: ReadScope, month: YearMonth) {
        const book = yield* load(scope);
        const flows = flowsIn(book.flows, monthBound(month));

        return {
          dailySpend: yield* dailySpend(
            flows,
            startOfMonth(month),
            endOfMonth(month)
          ),
          merchants: yield* merchantRowsOf(flows, TOP_MERCHANT_LIMIT),
          month,
          payments: paymentsOf(flows, book.names, book.payees),
          repeatPayments: yield* repeatPaymentsOf(flows, REPEAT_PAYMENT_LIMIT),
          spendByCategory: yield* categoryRowsOf(book.tree, flows),
          totals: yield* totalsOf(flows, book.currency),
        };
      }
    );

    const months = Effect.fn("ReportService.months")(function* months(
      scope: ReadScope
    ) {
      const book = yield* load(scope);

      return { months: monthsHeld(book.flows) };
    });

    const spendingSummary = Effect.fn("ReportService.spendingSummary")(
      function* spendingSummary(scope: ReadScope, bound: Bound) {
        const book = yield* load(scope);
        const flows = flowsIn(book.flows, bound);
        const totals = yield* totalsOf(flows, book.currency);

        return {
          bound,
          categories: yield* categoryRowsOf(book.tree, flows),
          currency: book.currency,
          spendMinor: totals.spendMinor,
        };
      }
    );

    const incomeSummary = Effect.fn("ReportService.incomeSummary")(
      function* incomeSummary(scope: ReadScope, bound: Bound) {
        const book = yield* load(scope);
        const flows = flowsIn(book.flows, bound);
        const totals = yield* totalsOf(flows, book.currency);

        return {
          bound,
          clients: yield* incomeRowsOf(
            flows,
            book.payees,
            summaryMonthsOf(bound),
            Option.none()
          ),
          currency: book.currency,
          incomeMinor: totals.incomeMinor,
          refundMinor: totals.refundMinor,
        };
      }
    );

    const monthlyTotals = Effect.fn("ReportService.monthlyTotals")(
      function* monthlyTotals(scope: ReadScope, bound: Bound) {
        const book = yield* load(scope);
        const flows = flowsIn(book.flows, bound);
        const periodMonths = monthsOfPeriod(bound, flows);

        return {
          currency: book.currency,
          months: yield* monthTotalsOf(flows, book.currency, periodMonths),
        };
      }
    );

    return {
      categoryPayments,
      categoryReport,
      dashboard,
      income,
      incomeSummary,
      monthReport,
      monthlyTotals,
      months,
      spending,
      spendingSummary,
    } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
