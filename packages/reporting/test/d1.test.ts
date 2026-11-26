import { describe, expect, it } from "@effect/vitest";
import { CurrentPerson, PersonSchema } from "@pecunia/access";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { Effect, Layer, Option, Schema } from "effect";

import {
  listMonths,
  readCategories,
  readDashboard,
  readIncome,
  spendingSummary,
} from "../src/capabilities.js";
import { d1ReportSourceLayer } from "../src/d1.js";
import {
  BoundSchema,
  DateOnlySchema,
  PeriodChoiceSchema,
  ProfileIdSchema,
} from "../src/model.js";
import { ReportService } from "../src/service.js";

const seededProfileId = "0192f0c1-0001-702d-8484-48490b729601";

const demoD1Layer = () =>
  Effect.gen(function* buildLayer() {
    const today = yield* Schema.decodeEffect(DateOnlySchema)("2025-12-15");

    const person = yield* Schema.decodeEffect(PersonSchema)({
      email: "demo@example.com",
      memberships: [{ profileId: seededProfileId, role: "owner" }],
      personId: "person-demo",
    });

    return Layer.mergeAll(
      ReportService.layer.pipe(
        Layer.provide(d1ReportSourceLayer({ today })),
        Layer.provide(openDemoSqliteLayer())
      ),
      Layer.succeed(CurrentPerson, person)
    );
  }).pipe(Layer.unwrap);

describe("d1ReportSourceLayer against migrated demo D1 schema", () => {
  it.effect(
    "computes dashboard totals, categories, income, months, and tax owed from seeded D1 rows",
    () =>
      Effect.gen(function* testReportingD1() {
        const profileId =
          yield* Schema.decodeEffect(ProfileIdSchema)(seededProfileId);

        const dashboard = yield* readDashboard.handler({
          period: PeriodChoiceSchema.cases.All.make({}),
          profileId,
        });

        expect(dashboard.totals.currency).toBe("EUR");
        expect(dashboard.totals.incomeMinor).toBe(480_000);
        expect(dashboard.totals.refundMinor).toBe(3500);
        expect(dashboard.totals.taxMinor).toBe(250_000);
        expect(dashboard.totals.spendMinor).toBe(328_955);
        expect(dashboard.taxOwed.minor).toBe(312_500);
        expect(dashboard.balance.accounts).toHaveLength(2);

        const categories = yield* readCategories.handler({
          period: PeriodChoiceSchema.cases.All.make({}),
          profileId,
        });

        expect(categories.categoryCount).toBe(7);
        expect(categories.categories.length).toBeGreaterThan(0);

        const income = yield* readIncome.handler({
          clientId: Option.none(),
          period: PeriodChoiceSchema.cases.All.make({}),
          profileId,
        });

        expect(income.clients).toHaveLength(1);
        expect(income.clients[0]?.client.name).toBe("Example Ltd");
        expect(income.clients[0]?.incomeMinor).toBe(480_000);

        const months = yield* listMonths.handler({ profileId });

        expect(months.months.length).toBeGreaterThan(0);

        const summary = yield* spendingSummary.handler({
          bound: BoundSchema.cases.All.make({}),
          profileId,
        });

        expect(summary.spendMinor).toBe(dashboard.totals.spendMinor);
      }).pipe(Effect.provide(demoD1Layer()))
  );
});
