import { expect, it } from "@effect/vitest";
import { Effect, Option, Predicate } from "effect";

import {
  incomeSummary,
  listMonths,
  monthlyTotals,
  readDashboard,
  readMonth,
  reportCapabilities,
  spendingSummary,
} from "../src/capabilities.js";
import {
  incomeSummaryContract,
  monthlyTotalsContract,
  reportContracts,
  spendingSummaryContract,
  toolContracts,
} from "../src/contracts.js";
import { boundOf } from "../src/date.js";
import { demoProfileId } from "../src/demo.js";
import { PeriodChoiceSchema } from "../src/model.js";
import { dateOf, monthOf } from "./fixtures.js";
import { demoCapabilityLayer, personLayer, stranger } from "./service-layer.js";

const march = PeriodChoiceSchema.cases.Month.make({});

const range = boundOf(dateOf("2024-03-01"), dateOf("2024-03-31"));

it.effect("the dashboard capability answers for a member of the profile", () =>
  Effect.gen(function* dashboard() {
    const report = yield* Effect.provide(
      readDashboard.handler({ period: march, profileId: demoProfileId }),
      demoCapabilityLayer
    );

    expect(report.totals.spendMinor).toBe(90_945);
    expect(report.balance.totalMinor).toBe(422_000);
  })
);

it.effect("a reader outside the profile is refused by name", () =>
  Effect.gen(function* forbidden() {
    const failure = yield* Effect.provide(
      readDashboard.handler({ period: march, profileId: demoProfileId }),
      personLayer(stranger)
    ).pipe(Effect.flip);

    expect(failure._tag).toBe("Forbidden");

    if (Predicate.isTagged(failure, "Forbidden")) {
      expect(failure.reason).toBe("notMember");
    }
  })
);

it.effect(
  "an agent asks for spend by category over a date range and gets exact shares",
  () =>
    Effect.gen(function* toolSpending() {
      const summary = yield* Effect.provide(
        spendingSummary.handler({ bound: range, profileId: demoProfileId }),
        demoCapabilityLayer
      );

      expect(summary.spendMinor).toBe(90_945);
      expect(summary.categories).toHaveLength(4);
      expect(
        summary.categories.reduce(
          (total, row) => total + row.shareBasisPoints,
          0
        )
      ).toBe(10_000);
      expect(
        summary.categories.reduce((total, row) => total + row.spendMinor, 0)
      ).toBe(90_945);
    })
);

it.effect(
  "an agent asks for income by client and gets refunds kept apart",
  () =>
    Effect.gen(function* toolIncome() {
      const summary = yield* Effect.provide(
        incomeSummary.handler({ bound: range, profileId: demoProfileId }),
        demoCapabilityLayer
      );

      expect(summary.incomeMinor).toBe(205_200);
      expect(summary.refundMinor).toBe(2500);
      expect(summary.clients.map((row) => row.client.name)).toStrictEqual([
        "Example Ltd",
        "Example Studio",
      ]);
    })
);

it.effect("an agent asks for month by month totals over a date range", () =>
  Effect.gen(function* toolMonths() {
    const totals = yield* Effect.provide(
      monthlyTotals.handler({ bound: range, profileId: demoProfileId }),
      demoCapabilityLayer
    );

    expect(totals.months.map((row) => row.month)).toStrictEqual([
      monthOf("2024-03"),
    ]);
    expect(totals.months[0]?.totals.netMinor).toBe(96_755);
  })
);

it.effect(
  "the months and statement capabilities answer over the same book",
  () =>
    Effect.gen(function* monthsAndStatement() {
      const months = yield* Effect.provide(
        listMonths.handler({ profileId: demoProfileId }),
        demoCapabilityLayer
      );

      const statement = yield* Effect.provide(
        readMonth.handler({
          month: monthOf("2024-03"),
          profileId: demoProfileId,
        }),
        demoCapabilityLayer
      );

      expect(months.months).toHaveLength(3);
      expect(statement.payments.length).toBeGreaterThan(0);
      expect(statement.totals.spendMinor).toBe(90_945);
    })
);

it("every report contract is listed once, and the three tools are report contracts", () => {
  const names = reportContracts.map((contract) => contract.name);

  expect(new Set(names).size).toBe(names.length);
  expect(names).toContain("readDashboard");
  expect(names).toContain("readCategories");
  expect(names).toContain("readSpending");
  expect(names).toContain("readCategoryPayments");
  expect(names).toContain("readIncome");
  expect(names).toContain("readMonth");
  expect(names).toContain("listMonths");

  for (const contract of toolContracts) {
    expect(names).toContain(contract.name);
    expect(contract.annotations.readOnly).toBe(true);
  }

  expect(toolContracts).toStrictEqual([
    spendingSummaryContract,
    incomeSummaryContract,
    monthlyTotalsContract,
  ]);
});

it("every capability is bound to a contract in the report list", () => {
  for (const capability of reportCapabilities) {
    expect(reportContracts.map((contract) => contract.name)).toContain(
      capability.contract.name
    );
  }

  expect(
    reportCapabilities.every(
      (capability) => capability.contract.annotations.readOnly
    )
  ).toBe(true);
  expect(Option.isNone(Option.none())).toBe(true);
});
