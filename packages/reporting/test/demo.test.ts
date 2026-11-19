import { expect, it } from "@effect/vitest";
import { Effect, Option, Predicate } from "effect";

import { demoToday } from "../src/demo.js";
import { ForecastSchema, PeriodChoiceSchema } from "../src/model.js";
import type { CategorySpend, ClientIncome } from "../src/model.js";
import { ReportService } from "../src/service.js";
import { currencyOf, minorUnits, monthOf } from "./fixtures.js";
import { demoScope, demoServiceLayer } from "./service-layer.js";

const layer = demoServiceLayer;

const march = PeriodChoiceSchema.cases.Month.make({});

const all = PeriodChoiceSchema.cases.All.make({});

const categoriesOf = (rows: readonly CategorySpend[]) =>
  rows.map((row) =>
    Predicate.isTagged(row.category, "Categorised")
      ? [row.category.name, row.spendMinor]
      : ["Uncategorised", row.spendMinor]
  );

const clientsOf = (rows: readonly ClientIncome[]) =>
  rows.map((row) => [row.client.name, row.incomeMinor]);

it.effect("the demo book's March totals match the hand count", () =>
  Effect.gen(function* marchTotals() {
    const report = yield* Effect.provide(
      Effect.gen(function* marchDashboard() {
        const service = yield* ReportService;

        return yield* service.dashboard(demoScope, march);
      }),
      layer
    );

    expect(report.totals.moneyInMinor).toBe(207_700);
    expect(report.totals.moneyOutMinor).toBe(110_945);
    expect(report.totals.netMinor).toBe(96_755);
    expect(report.totals.incomeMinor).toBe(205_200);
    expect(report.totals.refundMinor).toBe(2500);
    expect(report.totals.otherInMinor).toBe(0);
    expect(report.totals.spendMinor).toBe(90_945);
    expect(report.totals.taxMinor).toBe(20_000);
    expect(report.totals.currency).toBe(currencyOf("EUR"));
  })
);

it.effect(
  "the demo book's balance, tax, currency split and daily chart match the hand count",
  () =>
    Effect.gen(function* marchFigures() {
      const report = yield* Effect.provide(
        Effect.gen(function* marchDashboard() {
          const service = yield* ReportService;

          return yield* service.dashboard(demoScope, march);
        }),
        layer
      );

      expect(report.balance.totalMinor).toBe(422_000);
      expect(
        report.balance.accounts.map((row) => row.amount.minor)
      ).toStrictEqual([250_000, 92_000, 80_000]);
      expect(report.taxOwed.minor).toBe(120_000);
      expect(
        report.spendByCurrency.map((row) => [row.currency, row.spendMinor])
      ).toStrictEqual([
        ["EUR", 86_345],
        ["USD", 5000],
      ]);
      expect(report.dailySpend).toHaveLength(31);
      expect(
        report.dailySpend.reduce((total, row) => total + row.spendMinor, 0)
      ).toBe(90_945);
      expect(
        report.dailySpend.find((row) => row.date === "2024-03-05")?.spendMinor
      ).toBe(12_345);
      expect(report.recentPayments).toHaveLength(5);
      expect(report.recentPayments[0]?.merchant).toBe("Demo Market");
      expect(report.recentPayments[0]?.amount.minor).toBe(3000);
      expect(report.forecast).toStrictEqual(
        ForecastSchema.cases.Running.make({
          averageDailyMinor: minorUnits(6063),
          elapsedDays: 15,
          month: monthOf("2024-03"),
          projectedRemainderMinor: minorUnits(97_008),
          projectedSpendMinor: minorUnits(187_953),
          spendMinor: minorUnits(90_945),
          totalDays: 31,
        })
      );
    })
);

it.effect("the demo book's categories roll a parent's children into it", () =>
  Effect.gen(function* marchCategories() {
    const report = yield* Effect.provide(
      Effect.gen(function* marchCategoryReport() {
        const service = yield* ReportService;

        return yield* service.categoryReport(demoScope, march);
      }),
      layer
    );

    expect(categoriesOf(report.categories)).toStrictEqual([
      ["Rent", 45_000],
      ["Living", 29_945],
      ["Software", 12_000],
      ["Transport", 4000],
    ]);
    expect(
      report.categories.reduce((total, row) => total + row.shareBasisPoints, 0)
    ).toBe(10_000);
    expect(report.categoryCount).toBe(6);
    expect(report.uncategorisedMinor).toBe(0);
  })
);

it.effect("the demo book's spending splits personal against business", () =>
  Effect.gen(function* marchSpending() {
    const report = yield* Effect.provide(
      Effect.gen(function* marchSpendingReport() {
        const service = yield* ReportService;

        return yield* service.spending(demoScope, march);
      }),
      layer
    );

    expect(
      report.split.map((row) => [row.bucket, row.spendMinor])
    ).toStrictEqual([
      ["business", 12_000],
      ["mixed", 0],
      ["personal", 78_945],
      ["uncategorised", 0],
    ]);
    expect(
      report.split.reduce((total, row) => total + row.shareBasisPoints, 0)
    ).toBe(10_000);
    expect(report.stackedMonths).toHaveLength(1);
    expect(report.stackedMonths[0]?.totalMinor).toBe(90_945);
  })
);

it.effect(
  "the demo book's March income is by client, with the refund kept apart",
  () =>
    Effect.gen(function* marchIncome() {
      const report = yield* Effect.provide(
        Effect.gen(function* marchIncomeReport() {
          const service = yield* ReportService;

          return yield* service.income(demoScope, march, Option.none());
        }),
        layer
      );

      expect(clientsOf(report.clients)).toStrictEqual([
        ["Example Ltd", 150_000],
        ["Example Studio", 55_200],
      ]);
      expect(report.refundMinor).toBe(2500);
      expect(report.totals.incomeMinor).toBe(205_200);
    })
);

it.effect("the demo book's March statement matches the hand count", () =>
  Effect.gen(function* marchStatement() {
    const statement = yield* Effect.provide(
      Effect.gen(function* marchStatementReport() {
        const service = yield* ReportService;

        return yield* service.monthReport(demoScope, monthOf("2024-03"));
      }),
      layer
    );

    expect(statement.dailySpend).toHaveLength(31);
    expect(statement.merchants.map((row) => row.merchant)).toStrictEqual([
      "Demo Lettings",
      "Demo Market",
      "Example SaaS",
      "Demo Ferry",
      "Demo Transit",
    ]);
    expect(statement.repeatPayments).toStrictEqual([
      {
        merchant: "Demo Market",
        payments: 3,
        spendMinor: 25_345,
      },
    ]);
    expect(statement.payments).toHaveLength(11);
    expect(statement.totals.spendMinor).toBe(90_945);
  })
);

it.effect(
  "the demo book lists its months newest first, and totals each one",
  () =>
    Effect.gen(function* monthsAndTotals() {
      const listed = yield* Effect.provide(
        Effect.gen(function* list() {
          const service = yield* ReportService;

          return yield* service.months(demoScope);
        }),
        layer
      );

      const totals = yield* Effect.provide(
        Effect.gen(function* monthly() {
          const service = yield* ReportService;

          return yield* service.monthlyTotals(demoScope, all);
        }),
        layer
      );

      expect(listed.months).toStrictEqual([
        monthOf("2024-04"),
        monthOf("2024-03"),
        monthOf("2024-02"),
      ]);
      expect(
        totals.months.map((row) => [
          row.month,
          row.totals.moneyInMinor,
          row.totals.moneyOutMinor,
          row.totals.netMinor,
        ])
      ).toStrictEqual([
        ["2024-02", 0, 15_000, -15_000],
        ["2024-03", 207_700, 110_945, 96_755],
        ["2024-04", 90_000, 20_000, 70_000],
      ]);
      expect(demoToday).toBe("2024-03-15");
    })
);
