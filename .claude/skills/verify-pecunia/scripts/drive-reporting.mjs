#!/usr/bin/env node
import { Effect, Layer, Option } from "effect";

import { CurrentPerson } from "../../../../packages/access/dist/index.js";
import {
  incomeSummary,
  listMonths,
  monthlyTotals,
  readCategories,
  readCategoryPayments,
  readDashboard,
  readIncome,
  readMonth,
  readSpending,
  spendingSummary,
} from "../../../../packages/reporting/dist/capabilities.js";
import {
  demoLivingCategoryId,
  demoPerson,
  demoProfileId,
  demoReportSeed,
} from "../../../../packages/reporting/dist/demo.js";
import { memoryReportSourceLayer } from "../../../../packages/reporting/dist/memory.js";
import {
  BoundSchema,
  PeriodChoiceSchema,
} from "../../../../packages/reporting/dist/model.js";
import { ReportService } from "../../../../packages/reporting/dist/service.js";
import { observe } from "./lib/observation.mjs";

const world = Layer.mergeAll(
  ReportService.layer.pipe(
    Layer.provide(memoryReportSourceLayer(demoReportSeed))
  ),
  Layer.succeed(CurrentPerson, demoPerson)
);

const period = PeriodChoiceSchema.cases.Month.make({});

const request = { period, profileId: demoProfileId };

const range = {
  bound: BoundSchema.cases.Between.make({
    from: "2024-03-01",
    to: "2024-03-31",
  }),
  profileId: demoProfileId,
};

const categoriesText = (rows) =>
  rows
    .map((row) => `${row.category.name ?? "Uncategorised"}:${row.spendMinor}`)
    .toSorted()
    .join(",");

const clientsText = (rows) =>
  rows
    .map((row) => `${row.client.name}:${row.incomeMinor}`)
    .toSorted()
    .join(",");

const observations = await Effect.runPromise(
  Effect.gen(function* driveReports() {
    const dashboard = yield* readDashboard.handler(request);
    const categories = yield* readCategories.handler(request);
    const spending = yield* readSpending.handler(request);

    const payments = yield* readCategoryPayments.handler({
      ...request,
      categoryId: demoLivingCategoryId,
    });

    const income = yield* readIncome.handler({
      ...request,
      clientId: Option.none(),
    });

    const month = yield* readMonth.handler({
      month: "2024-03",
      profileId: demoProfileId,
    });

    const months = yield* listMonths.handler({ profileId: demoProfileId });
    const spendSummary = yield* spendingSummary.handler(range);
    const inSummary = yield* incomeSummary.handler(range);
    const totals = yield* monthlyTotals.handler(range);

    return [
      observe({
        id: "reporting-dashboard-totals",
        value: `spend=${dashboard.totals.spendMinor} income=${dashboard.totals.incomeMinor} refund=${dashboard.totals.refundMinor} balance=${dashboard.balance.totalMinor} tax=${dashboard.taxOwed.minor}`,
      }),
      observe({
        id: "reporting-category-totals",
        value: `spend=${categories.totals.spendMinor} ${categoriesText(categories.categories)}`,
      }),
      observe({
        id: "reporting-spending-split",
        value: spending.split
          .map(
            (row) => `${row.bucket}:${row.spendMinor}:${row.shareBasisPoints}`
          )
          .toSorted()
          .join(","),
      }),
      observe({
        id: "reporting-parent-payments",
        value: `spend=${payments.spendMinor} lines=${payments.payments.map((row) => row.merchant).join(",")} sum=${payments.payments.reduce((sum, row) => sum + row.amount.minor, 0)}`,
      }),
      observe({
        id: "reporting-income-clients",
        value: `income=${income.totals.incomeMinor} refund=${income.refundMinor} ${clientsText(income.clients)}`,
      }),
      observe({
        id: "reporting-month-statement",
        value: `spend=${month.totals.spendMinor} days=${month.dailySpend.length} daily=${month.dailySpend.reduce((sum, row) => sum + row.spendMinor, 0)} payments=${month.payments.length}`,
      }),
      observe({ id: "reporting-months-held", value: months.months.join(",") }),
      observe({
        id: "reporting-spending-summary",
        value: `${spendSummary.currency} ${spendSummary.spendMinor} ${categoriesText(spendSummary.categories)}`,
      }),
      observe({
        id: "reporting-income-summary",
        value: `${inSummary.currency} income=${inSummary.incomeMinor} refund=${inSummary.refundMinor} ${clientsText(inSummary.clients)}`,
      }),
      observe({
        id: "reporting-monthly-totals",
        value: totals.months
          .map(
            (row) =>
              `${row.month} in=${row.totals.moneyInMinor} out=${row.totals.moneyOutMinor} net=${row.totals.netMinor}`
          )
          .join(","),
      }),
    ];
  }).pipe(Effect.provide(world))
);

process.stdout.write(`${JSON.stringify({ observations }, null, 2)}\n`);
