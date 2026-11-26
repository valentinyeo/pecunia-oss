#!/usr/bin/env node
import { Effect, Layer, Option, Predicate } from "effect";

import { CurrentPerson } from "../../../../packages/access/dist/index.js";
import {
  changeSubscriptionStatus,
  findRepeatPayments,
  listSubscriptions,
  markRepeatPayment,
  setSubscriptionCategory,
} from "../../../../packages/subscriptions/dist/capabilities.js";
import {
  demoCategories,
  demoPerson,
  demoProfileId,
  demoSubscriptionSeed,
  demoSubscriptions,
} from "../../../../packages/subscriptions/dist/demo.js";
import { memorySubscriptionStoreLayer } from "../../../../packages/subscriptions/dist/memory.js";
import {
  StatusChangeSchema,
  SubscriptionCategoryChangeSchema,
  SubscriptionFilterSchema,
} from "../../../../packages/subscriptions/dist/model.js";
import { SubscriptionService } from "../../../../packages/subscriptions/dist/service.js";
import { SubscriptionStore } from "../../../../packages/subscriptions/dist/store.js";
import { countingLayer, mutationRecorder } from "./lib/mutating-adapter.mjs";
import { observe } from "./lib/observation.mjs";

const recorder = mutationRecorder();

const store = countingLayer({
  layer: memorySubscriptionStoreLayer(demoSubscriptionSeed),
  mutations: ["mark", "patchStatus", "categorise"],
  recorder,
  service: SubscriptionStore,
});

const world = Layer.mergeAll(
  SubscriptionService.layer.pipe(Layer.provide(store)),
  store,
  Layer.succeed(CurrentPerson, demoPerson)
);

const request = {
  filter: SubscriptionFilterSchema.cases.All.make({}),
  profileId: demoProfileId,
};

const [cloud, coffee] = demoSubscriptions;

const categoryId = demoCategories[2].id;

const subscriptionRecords = (page, allCharges) =>
  page.subscriptions.map((row) => {
    const rowCategory = Option.getOrNull(row.categoryId);

    const payeeCharges = allCharges.filter(
      (charge) => charge.payeeId === row.payeeId
    );

    return {
      activeAnnualMinor: page.activeAnnual.minor,
      activeMonthlyMinor: page.activeMonthly.minor,
      annualMinor: row.cost.annual.minor,
      categoryId: rowCategory,
      chargesCount: payeeCharges.length,
      currency: row.cost.annual.currency,
      frequency: row.frequency,
      id: row.id,
      matchingCharges:
        rowCategory === null
          ? 0
          : payeeCharges.filter((charge) =>
              Option.contains(charge.categoryId, rowCategory)
            ).length,
      monthlyMinor: row.cost.monthly.minor,
      nextCharge: Option.getOrNull(row.nextCharge),
      payeeId: row.payeeId,
      profileId: demoProfileId,
      status: row.status._tag,
    };
  });

const observations = await Effect.runPromise(
  Effect.gen(function* driveSubscriptions() {
    const adapter = yield* SubscriptionStore;
    const before = yield* listSubscriptions.handler(request);

    const detected = yield* findRepeatPayments.handler({
      profileId: demoProfileId,
    });

    const emitted = [
      observe({
        id: "subscriptions-capability-lists-costs",
        value: `rows=${before.subscriptions.length} monthly=${before.activeMonthly.minor} annual=${before.activeAnnual.minor} cancelled=${before.subscriptions.filter((row) => Predicate.isTagged(row.status, "Cancelled")).length}`,
      }),
      observe({
        id: "subscriptions-capability-detects-history",
        value: detected.payments
          .map(
            (row) =>
              `${row.payeeName}:${row.frequency}:${row.typicalBaseAmount.minor}:${row.occurrenceCount}`
          )
          .toSorted()
          .join(","),
      }),
    ];

    const marked = yield* markRepeatPayment.handler({
      frequency: "monthly",
      payeeId: coffee.payeeId,
      profileId: demoProfileId,
    });

    emitted.push(
      observe({
        id: "subscriptions-capability-marks-existing",
        value: `sameId=${marked.id === coffee.id} status=${marked.status._tag} annual=${marked.cost.annual.minor}`,
      })
    );

    const afterMark = yield* listSubscriptions.handler(request);
    const chargesAfterMark = yield* adapter.charges(demoProfileId);

    emitted.push(
      observe({
        id: "subscriptions-mark-reads-back",
        operation: "listSubscriptions",
        value: subscriptionRecords(afterMark, chargesAfterMark),
      })
    );

    const cancelled = yield* changeSubscriptionStatus.handler({
      change: StatusChangeSchema.cases.Cancel.make({}),
      profileId: demoProfileId,
      subscriptionId: cloud.id,
    });

    emitted.push(
      observe({
        id: "subscriptions-capability-cancels",
        value: `status=${cancelled.status._tag} next=${Option.getOrNull(cancelled.nextCharge)}`,
      })
    );
    const afterCancel = yield* listSubscriptions.handler(request);
    const chargesAfterCancel = yield* adapter.charges(demoProfileId);
    emitted.push(
      observe({
        id: "subscriptions-cancel-reads-back",
        operation: "listSubscriptions",
        value: subscriptionRecords(afterCancel, chargesAfterCancel),
      })
    );

    const assigned = yield* setSubscriptionCategory.handler({
      category: SubscriptionCategoryChangeSchema.cases.Assign.make({
        categoryId,
      }),
      profileId: demoProfileId,
      subscriptionId: coffee.id,
    });

    emitted.push(
      observe({
        id: "subscriptions-capability-sets-category",
        value: Option.getOrNull(assigned.categoryId),
      })
    );
    const afterCategory = yield* listSubscriptions.handler(request);
    const chargesAfterCategory = yield* adapter.charges(demoProfileId);

    emitted.push(
      observe({
        id: "subscriptions-category-reads-back",
        operation: "listSubscriptions",
        value: subscriptionRecords(afterCategory, chargesAfterCategory),
      })
    );

    return emitted;
  }).pipe(Effect.provide(world))
);

process.stdout.write(
  `${JSON.stringify({ observations, mutatingCalls: recorder.total() }, null, 2)}\n`
);
