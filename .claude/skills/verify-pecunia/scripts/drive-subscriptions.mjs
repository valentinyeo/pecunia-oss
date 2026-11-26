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

const observations = await Effect.runPromise(
  Effect.gen(function* driveSubscriptions() {
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

    const markedRow = afterMark.subscriptions.find(
      (row) => row.id === coffee.id
    );

    emitted.push(
      observe({
        id: "subscriptions-mark-reads-back",
        operation: "listSubscriptions",
        value: `rows=${afterMark.subscriptions.length} frequency=${markedRow.frequency} status=${markedRow.status._tag} annual=${markedRow.cost.annual.minor} next=${Option.getOrNull(markedRow.nextCharge)}`,
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
    emitted.push(
      observe({
        id: "subscriptions-cancel-reads-back",
        operation: "listSubscriptions",
        value: `cloud=${afterCancel.subscriptions.find((row) => row.id === cloud.id).status._tag} monthly=${afterCancel.activeMonthly.minor} annual=${afterCancel.activeAnnual.minor}`,
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
    const adapter = yield* SubscriptionStore;

    const charges = (yield* adapter.charges(demoProfileId)).filter(
      (row) => row.payeeId === coffee.payeeId
    );

    emitted.push(
      observe({
        id: "subscriptions-category-reads-back",
        operation: "listSubscriptions",
        value: `category=${Option.getOrNull(afterCategory.subscriptions.find((row) => row.id === coffee.id).categoryId)} charges=${charges.length} matching=${charges.filter((row) => Option.contains(row.categoryId, categoryId)).length}`,
      })
    );

    return emitted;
  }).pipe(Effect.provide(world))
);

process.stdout.write(
  `${JSON.stringify({ observations, mutatingCalls: recorder.total() }, null, 2)}\n`
);
