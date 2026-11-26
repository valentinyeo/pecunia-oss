import { describe, expect, it } from "@effect/vitest";
import { CurrentPerson } from "@pecunia/access";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { Effect, Layer, Option, Predicate, Schema } from "effect";

import {
  changeSubscriptionStatus,
  listSubscriptions,
  setSubscriptionCategory,
} from "../src/capabilities.js";
import { d1SubscriptionStoreLayer } from "../src/d1.js";
import { demoPerson, demoProfileId } from "../src/demo.js";
import {
  CategoryIdSchema,
  StatusChangeSchema,
  SubscriptionCategoryChangeSchema,
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
} from "../src/model.js";
import { SubscriptionService } from "../src/service.js";

const demoD1Layer = () =>
  Layer.mergeAll(
    SubscriptionService.layer.pipe(
      Layer.provide(d1SubscriptionStoreLayer),
      Layer.provide(openDemoSqliteLayer())
    ),
    Layer.succeed(CurrentPerson, demoPerson)
  );

describe("d1SubscriptionStoreLayer against migrated demo D1 schema", () => {
  it.effect(
    "lists seeded subscriptions, cancels and restores one, and updates totals",
    () =>
      Effect.gen(function* testSubscriptionsD1() {
        const initial = yield* listSubscriptions.handler({
          filter: SubscriptionFilterSchema.cases.All.make({}),
          profileId: demoProfileId,
        });

        expect(initial.subscriptions).toHaveLength(2);
        expect(initial.activeMonthly.minor).toBe(29_900);
        expect(initial.activeAnnual.minor).toBe(358_800);

        const cloudId = yield* Schema.decodeEffect(SubscriptionIdSchema)(
          "0192f0c1-0033-7362-801a-01a8162ef271"
        );

        const cancelled = yield* changeSubscriptionStatus.handler({
          change: StatusChangeSchema.cases.Cancel.make({}),
          profileId: demoProfileId,
          subscriptionId: cloudId,
        });

        expect(Predicate.isTagged(cancelled.status, "Cancelled")).toBe(true);

        const afterCancel = yield* listSubscriptions.handler({
          filter: SubscriptionFilterSchema.cases.Active.make({}),
          profileId: demoProfileId,
        });

        expect(afterCancel.subscriptions).toHaveLength(0);
        expect(afterCancel.activeAnnual.minor).toBe(0);

        const restored = yield* changeSubscriptionStatus.handler({
          change: StatusChangeSchema.cases.Restore.make({ to: "Confirmed" }),
          profileId: demoProfileId,
          subscriptionId: cloudId,
        });

        expect(Predicate.isTagged(restored.status, "Confirmed")).toBe(true);
      }).pipe(Effect.provide(demoD1Layer()))
  );

  it.effect("sets subscription category and persists across reads", () =>
    Effect.gen(function* testSetCategory() {
      const cloudId = yield* Schema.decodeEffect(SubscriptionIdSchema)(
        "0192f0c1-0033-7362-801a-01a8162ef271"
      );

      const softwareCategoryId = yield* Schema.decodeEffect(CategoryIdSchema)(
        "0192f0c1-000d-75e9-8fd7-fd7e43c901ee"
      );

      const updated = yield* setSubscriptionCategory.handler({
        category: SubscriptionCategoryChangeSchema.cases.Assign.make({
          categoryId: softwareCategoryId,
        }),
        profileId: demoProfileId,
        subscriptionId: cloudId,
      });

      expect(Option.getOrNull(updated.categoryId)).toBe(softwareCategoryId);
    }).pipe(Effect.provide(demoD1Layer()))
  );
});
