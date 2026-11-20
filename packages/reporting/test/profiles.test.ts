import { expect, it } from "@effect/vitest";
import { Effect, Option, Predicate, Schema } from "effect";

import {
  listMonths,
  readCategories,
  readCategoryPayments,
  readDashboard,
  readIncome,
  readMonth,
  readSpending,
} from "../src/capabilities.js";
import {
  demoLivingCategoryId,
  demoProfileId,
  secondHousingCategoryId,
  secondProfileId,
} from "../src/demo.js";
import type { CategorySpend, ProfileId } from "../src/model.js";
import { PeriodChoiceSchema, ProfileIdSchema } from "../src/model.js";
import { monthOf } from "./fixtures.js";
import {
  memberOfSecond,
  personLayer,
  personOf,
  viewerOfDemo,
} from "./service-layer.js";

const march = PeriodChoiceSchema.cases.Month.make({});

const unseededProfileId: ProfileId = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-0009-7abc-8def-000000000009"
);

const memberOfUnseeded = personOf(
  "person-unseeded",
  unseededProfileId,
  "owner"
);

const categoryNamesOf = (rows: readonly CategorySpend[]): readonly string[] =>
  rows.map((row) =>
    Predicate.isTagged(row.category, "Categorised")
      ? row.category.name
      : "Uncategorised"
  );

it.effect("a member of the second profile reads only that profile's book", () =>
  Effect.gen(function* secondProfileDashboard() {
    const report = yield* Effect.provide(
      readDashboard.handler({ period: march, profileId: secondProfileId }),
      personLayer(memberOfSecond)
    );

    expect(report.totals.currency).toBe("GBP");
    expect(report.totals.incomeMinor).toBe(7000);
    expect(report.totals.spendMinor).toBe(2500);
    expect(report.totals.moneyInMinor).toBe(7000);
    expect(report.totals.moneyOutMinor).toBe(2500);
    expect(report.totals.netMinor).toBe(4500);
    expect(report.balance.totalMinor).toBe(30_000);
    expect(report.recentPayments.map((row) => row.merchant)).toStrictEqual([
      "Demo Housing",
      "Example Garden Ltd",
    ]);
    expect(report.spendByCurrency.map((row) => row.currency)).toStrictEqual([
      "GBP",
    ]);
  })
);

it.effect(
  "a member of the second profile asking for the demo profile is refused",
  () =>
    Effect.gen(function* secondProfileForbidden() {
      const failure = yield* Effect.provide(
        readDashboard.handler({ period: march, profileId: demoProfileId }),
        personLayer(memberOfSecond)
      ).pipe(Effect.flip);

      expect(failure._tag).toBe("Forbidden");

      if (Predicate.isTagged(failure, "Forbidden")) {
        expect(failure.reason).toBe("notMember");
      }
    })
);

it.effect("a viewer of the demo profile reads the demo book", () =>
  Effect.gen(function* viewerReads() {
    const report = yield* Effect.provide(
      readDashboard.handler({ period: march, profileId: demoProfileId }),
      personLayer(viewerOfDemo)
    );

    const months = yield* Effect.provide(
      listMonths.handler({ profileId: demoProfileId }),
      personLayer(viewerOfDemo)
    );

    expect(report.totals.spendMinor).toBe(90_945);
    expect(report.balance.totalMinor).toBe(422_000);
    expect(months.months).toStrictEqual([
      monthOf("2024-04"),
      monthOf("2024-03"),
      monthOf("2024-02"),
    ]);
  })
);

it.effect("every read capability answers from the second profile's book", () =>
  Effect.gen(function* secondProfileCapabilities() {
    const layer = personLayer(memberOfSecond);

    const dashboard = yield* Effect.provide(
      readDashboard.handler({ period: march, profileId: secondProfileId }),
      layer
    );

    expect(dashboard.totals.spendMinor).toBe(2500);

    const categories = yield* Effect.provide(
      readCategories.handler({ period: march, profileId: secondProfileId }),
      layer
    );

    expect(categories.categoryCount).toBe(1);
    expect(categoryNamesOf(categories.categories)).toStrictEqual(["Housing"]);
    expect(categories.totals.spendMinor).toBe(2500);

    const spending = yield* Effect.provide(
      readSpending.handler({ period: march, profileId: secondProfileId }),
      layer
    );

    expect(
      spending.split.map((row) => [row.bucket, row.spendMinor])
    ).toStrictEqual([
      ["business", 0],
      ["mixed", 0],
      ["personal", 2500],
      ["uncategorised", 0],
    ]);

    const categoryPayments = yield* Effect.provide(
      readCategoryPayments.handler({
        categoryId: secondHousingCategoryId,
        period: march,
        profileId: secondProfileId,
      }),
      layer
    );

    expect(categoryPayments.spendMinor).toBe(2500);
    expect(categoryPayments.payments).toHaveLength(1);

    const income = yield* Effect.provide(
      readIncome.handler({
        clientId: Option.none(),
        period: march,
        profileId: secondProfileId,
      }),
      layer
    );

    expect(income.totals.incomeMinor).toBe(7000);
    expect(income.refundMinor).toBe(0);
    expect(income.clients.map((row) => row.client.name)).toStrictEqual([
      "Example Garden Ltd",
    ]);

    const statement = yield* Effect.provide(
      readMonth.handler({
        month: monthOf("2024-06"),
        profileId: secondProfileId,
      }),
      layer
    );

    expect(statement.totals.spendMinor).toBe(2500);
    expect(statement.payments).toHaveLength(2);

    const months = yield* Effect.provide(
      listMonths.handler({ profileId: secondProfileId }),
      layer
    );

    expect(months.months).toStrictEqual([monthOf("2024-06")]);
  })
);

it.effect("every read capability answers from the demo profile's book", () =>
  Effect.gen(function* demoProfileCapabilities() {
    const layer = personLayer(viewerOfDemo);

    const dashboard = yield* Effect.provide(
      readDashboard.handler({ period: march, profileId: demoProfileId }),
      layer
    );

    expect(dashboard.totals.spendMinor).toBe(90_945);
    expect(
      dashboard.recentPayments.every((row) => row.merchant !== "Demo Housing")
    ).toBe(true);

    const categories = yield* Effect.provide(
      readCategories.handler({ period: march, profileId: demoProfileId }),
      layer
    );

    expect(categories.categoryCount).toBe(6);
    expect(categoryNamesOf(categories.categories)).toStrictEqual([
      "Rent",
      "Living",
      "Software",
      "Transport",
    ]);

    const spending = yield* Effect.provide(
      readSpending.handler({ period: march, profileId: demoProfileId }),
      layer
    );

    expect(
      spending.split.find((row) => row.bucket === "personal")?.spendMinor
    ).toBe(78_945);

    const categoryPayments = yield* Effect.provide(
      readCategoryPayments.handler({
        categoryId: demoLivingCategoryId,
        period: march,
        profileId: demoProfileId,
      }),
      layer
    );

    expect(categoryPayments.spendMinor).toBe(29_945);
    expect(categoryPayments.payments).toHaveLength(4);

    const income = yield* Effect.provide(
      readIncome.handler({
        clientId: Option.none(),
        period: march,
        profileId: demoProfileId,
      }),
      layer
    );

    expect(income.totals.incomeMinor).toBe(205_200);
    expect(income.clients.map((row) => row.client.name)).toStrictEqual([
      "Example Ltd",
      "Example Studio",
    ]);

    const statement = yield* Effect.provide(
      readMonth.handler({
        month: monthOf("2024-03"),
        profileId: demoProfileId,
      }),
      layer
    );

    expect(statement.totals.spendMinor).toBe(90_945);

    const months = yield* Effect.provide(
      listMonths.handler({ profileId: demoProfileId }),
      layer
    );

    expect(months.months).toStrictEqual([
      monthOf("2024-04"),
      monthOf("2024-03"),
      monthOf("2024-02"),
    ]);
  })
);

it.effect("a member of a profile with no book reads zeros and no rows", () =>
  Effect.gen(function* unseededProfile() {
    const layer = personLayer(memberOfUnseeded);

    const report = yield* Effect.provide(
      readDashboard.handler({ period: march, profileId: unseededProfileId }),
      layer
    );

    expect(report.totals.moneyInMinor).toBe(0);
    expect(report.totals.moneyOutMinor).toBe(0);
    expect(report.totals.netMinor).toBe(0);
    expect(report.balance.totalMinor).toBe(0);
    expect(report.taxOwed.minor).toBe(0);
    expect(report.recentPayments).toStrictEqual([]);
    expect(report.spendByCurrency).toStrictEqual([]);
    expect(report.dailySpend).toHaveLength(31);
    expect(report.dailySpend.every((row) => row.spendMinor === 0)).toBe(true);

    const categories = yield* Effect.provide(
      readCategories.handler({
        period: march,
        profileId: unseededProfileId,
      }),
      layer
    );

    expect(categories.categories).toStrictEqual([]);
    expect(categories.categoryCount).toBe(0);

    const months = yield* Effect.provide(
      listMonths.handler({ profileId: unseededProfileId }),
      layer
    );

    expect(months.months).toStrictEqual([]);
  })
);
