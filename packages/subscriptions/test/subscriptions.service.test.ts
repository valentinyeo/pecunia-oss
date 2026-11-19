import { expect, it } from "@effect/vitest";
import { CurrentPerson, PersonSchema } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { Effect, Layer, Option, Predicate, Schema } from "effect";

import {
  changeSubscriptionStatus,
  findRepeatPayments,
  listSubscriptions,
  markRepeatPayment,
  setSubscriptionCategory,
} from "../src/capabilities.js";
import {
  demoPerson,
  demoPersonalProfileId,
  demoProfileId,
  demoStranger,
  demoSubscriptionSeed,
  demoViewer,
} from "../src/demo.js";
import { memorySubscriptionStoreLayer } from "../src/memory.js";
import {
  CategoryIdSchema,
  PayeeIdSchema,
  SubscriptionCategoryChangeSchema,
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
  StatusChangeSchema,
} from "../src/model.js";
import type {
  CategoryId,
  ChangeSubscriptionStatusRequest,
  ListSubscriptionsRequest,
  MarkRepeatPaymentRequest,
  SubscriptionCategoryChange,
  SubscriptionFilter,
  SubscriptionId,
  SubscriptionPage,
  SubscriptionView,
} from "../src/model.js";
import { SubscriptionService } from "../src/service.js";
import { SubscriptionStore } from "../src/store.js";

const storeLayer = memorySubscriptionStoreLayer(demoSubscriptionSeed);

const layerFor = (person: Person) =>
  Layer.mergeAll(
    SubscriptionService.layer.pipe(Layer.provide(storeLayer)),
    storeLayer,
    Layer.succeed(CurrentPerson, person)
  );

const asOwner = layerFor(demoPerson);

const bothProfilesPerson = Schema.decodeSync(PersonSchema)({
  email: "both-profiles@example.com",
  memberships: [
    { profileId: demoProfileId, role: "owner" },
    { profileId: demoPersonalProfileId, role: "owner" },
  ],
  personId: "person-both-profiles",
});

const active = SubscriptionFilterSchema.cases.Active.make({});

const all = SubscriptionFilterSchema.cases.All.make({});

const subscriptionId = (text: string): SubscriptionId =>
  Schema.decodeSync(SubscriptionIdSchema)(text);

const categoryId = (text: string): CategoryId =>
  Schema.decodeSync(CategoryIdSchema)(text);

const payee = (text: string) => Schema.decodeSync(PayeeIdSchema)(text);

const cloudSubscriptionId = subscriptionId(
  "0192f0c1-0033-7362-801a-01a8162ef271"
);

const coffeeSubscriptionId = subscriptionId(
  "0192f0c1-0034-7407-85f0-5f03b39b14e9"
);

const cloudPayeeId = payee("0192f0c1-0009-71f7-8998-998f8330df68");

const coffeePayeeId = payee("0192f0c1-000a-743c-890f-90fb094546ce");

const designToolPayeeId = payee("0192f0c1-000b-7839-88f7-8f744744f3e0");

const subscriptionCategoryId = categoryId(
  "0192f0c1-000f-755b-8ae4-ae47d20b52cf"
);

const listRequest = (filter: SubscriptionFilter): ListSubscriptionsRequest => ({
  filter,
  profileId: demoProfileId,
});

const viewOf = (
  page: SubscriptionPage,
  id: SubscriptionId
): SubscriptionView => {
  const found = page.subscriptions.find((entry) => entry.id === id);

  if (found === undefined) {
    throw new Error(`The page has no repeat payment ${id}`);
  }

  return found;
};

const statusChange = (
  id: SubscriptionId,
  change: ChangeSubscriptionStatusRequest["change"]
) =>
  changeSubscriptionStatus.handler({
    change,
    profileId: demoProfileId,
    subscriptionId: id,
  });

const cancel = (id: SubscriptionId) =>
  statusChange(id, StatusChangeSchema.cases.Cancel.make({}));

const restore = (
  id: SubscriptionId,
  to: "Confirmed" | "Detected" | "Dismissed" | "NotRecurring"
) => statusChange(id, StatusChangeSchema.cases.Restore.make({ to }));

const categorise = (id: SubscriptionId, category: SubscriptionCategoryChange) =>
  setSubscriptionCategory.handler({
    category,
    profileId: demoProfileId,
    subscriptionId: id,
  });

const markDesignTool: MarkRepeatPaymentRequest = {
  frequency: "monthly",
  payeeId: designToolPayeeId,
  profileId: demoProfileId,
};

it.effect(
  "lists the demo book with the monthly and annual cost it counts",
  () =>
    Effect.gen(function* listDemoBook() {
      const counted = yield* listSubscriptions.handler(listRequest(active));
      const cloud = viewOf(counted, cloudSubscriptionId);

      expect(counted.baseCurrency).toBe("EUR");
      expect(counted.activeMonthly).toEqual({ currency: "EUR", minor: 29_900 });
      expect(counted.activeAnnual).toEqual({ currency: "EUR", minor: 358_800 });
      expect(counted.subscriptions).toHaveLength(1);
      expect(cloud.payeeName).toBe("Demo Cloud Hosting");
      expect(cloud.frequency).toBe("monthly");
      expect(cloud.status._tag).toBe("Confirmed");
      expect(cloud.confidence).toBe(0.96);
      expect(cloud.cost.monthly).toEqual({ currency: "EUR", minor: 29_900 });
      expect(cloud.cost.annual).toEqual({ currency: "EUR", minor: 358_800 });
      expect(Option.getOrThrow(cloud.nextCharge)).toBe("2026-01-08");
      expect(Option.isNone(cloud.categoryId)).toBe(false);

      const everyNotice = yield* listSubscriptions.handler(listRequest(all));
      const coffee = viewOf(everyNotice, coffeeSubscriptionId);

      expect(everyNotice.subscriptions).toHaveLength(2);
      expect(coffee.status._tag).toBe("Cancelled");
      expect(Option.isNone(coffee.nextCharge)).toBe(true);
      expect(everyNotice.activeAnnual).toEqual(counted.activeAnnual);
    }).pipe(Effect.provide(asOwner))
);

it.effect("finds the repeat payments in the demo payment history", () =>
  Effect.gen(function* findDemoRepeatPayments() {
    const found = yield* findRepeatPayments.handler({
      profileId: demoProfileId,
    });

    const [newest, middle, oldest] = found.payments;

    expect(found.payments).toHaveLength(3);
    expect(newest?.payeeName).toBe("Demo Cloud Hosting");
    expect(newest?.frequency).toBe("monthly");
    expect(newest?.typicalAmount).toEqual({ currency: "EUR", minor: 29_900 });
    expect(newest?.lastChargedOn).toBe("2025-12-08");
    expect(newest?.nextExpectedOn).toBe("2026-01-08");
    expect(newest?.occurrenceCount).toBe(11);
    expect(middle?.payeeName).toBe("Demo Coffee");
    expect(middle?.frequency).toBe("weekly");
    expect(oldest?.payeeName).toBe("Demo Design Tool");
    expect(oldest?.frequency).toBe("monthly");
    expect(oldest?.typicalAmount).toEqual({ currency: "USD", minor: 2999 });
    expect(oldest?.typicalBaseAmount).toEqual({ currency: "EUR", minor: 2765 });
  }).pipe(Effect.provide(asOwner))
);

it.effect("marks a merchant as a repeat payment once, for one profile", () =>
  Effect.gen(function* markRepeatPaymentOnce() {
    const marked = yield* markRepeatPayment.handler(markDesignTool);

    expect(marked.payeeName).toBe("Demo Design Tool");
    expect(marked.status._tag).toBe("Confirmed");
    expect(marked.frequency).toBe("monthly");
    expect(marked.cost.monthly).toEqual({ currency: "EUR", minor: 2765 });
    expect(marked.cost.annual).toEqual({ currency: "EUR", minor: 33_180 });
    expect(Option.getOrThrow(marked.nextCharge)).toBe("2025-06-11");

    const again = yield* markRepeatPayment.handler(markDesignTool);

    expect(again.id).toBe(marked.id);

    const counted = yield* listSubscriptions.handler(listRequest(active));

    expect(counted.subscriptions).toHaveLength(2);
    expect(counted.activeMonthly).toEqual({ currency: "EUR", minor: 32_665 });
    expect(counted.activeAnnual).toEqual({ currency: "EUR", minor: 391_980 });

    const everyNotice = yield* listSubscriptions.handler(listRequest(all));
    const ids = everyNotice.subscriptions.map((entry) => entry.id);

    expect(everyNotice.subscriptions).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  }).pipe(Effect.provide(asOwner))
);

it.effect("cancels one profile's repeat payment and undoes it", () =>
  Effect.gen(function* cancelAndUndo() {
    const cancelled = yield* cancel(cloudSubscriptionId);

    expect(cancelled.status._tag).toBe("Cancelled");
    expect(Option.isNone(cancelled.nextCharge)).toBe(true);

    const counted = yield* listSubscriptions.handler(listRequest(active));

    expect(counted.subscriptions).toEqual([]);
    expect(counted.activeAnnual).toEqual({ currency: "EUR", minor: 0 });

    const restored = yield* restore(cloudSubscriptionId, "Confirmed");

    expect(restored.status._tag).toBe("Confirmed");
    expect(Option.getOrThrow(restored.nextCharge)).toBe("2026-01-08");

    const secondRestore = yield* restore(cloudSubscriptionId, "Detected").pipe(
      Effect.flip
    );

    expect(secondRestore._tag).toBe("IllegalStatusChange");

    const coffee = yield* cancel(coffeeSubscriptionId);

    expect(coffee.status._tag).toBe("Cancelled");

    const dismissed = yield* statusChange(
      cloudSubscriptionId,
      StatusChangeSchema.cases.Dismiss.make({})
    );

    expect(dismissed.status._tag).toBe("Dismissed");

    const cancelledWhileDismissed = yield* cancel(cloudSubscriptionId);

    expect(cancelledWhileDismissed.status._tag).toBe("Cancelled");

    const undismissed = yield* restore(cloudSubscriptionId, "Dismissed");

    expect(undismissed.status._tag).toBe("Dismissed");
  }).pipe(Effect.provide(asOwner))
);

it.effect("pushes a repeat payment's category onto its past payments", () =>
  Effect.gen(function* pushCategory() {
    const store = yield* SubscriptionStore;

    const before = yield* store.charges(demoProfileId);

    const cloudBefore = before.filter(
      (charge) => charge.payeeId === cloudPayeeId
    );

    expect(cloudBefore).toHaveLength(11);
    expect(
      cloudBefore.every(
        (charge) =>
          Option.getOrThrow(charge.categoryId) ===
          categoryId("0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba")
      )
    ).toBe(true);

    const assigned = yield* categorise(
      cloudSubscriptionId,
      SubscriptionCategoryChangeSchema.cases.Assign.make({
        categoryId: subscriptionCategoryId,
      })
    );

    expect(Option.getOrThrow(assigned.categoryId)).toBe(subscriptionCategoryId);

    const after = yield* store.charges(demoProfileId);

    const cloudAfter = after.filter(
      (charge) => charge.payeeId === cloudPayeeId
    );

    const coffeeAfter = after.filter(
      (charge) => charge.payeeId === coffeePayeeId
    );

    expect(
      cloudAfter.every(
        (charge) =>
          Option.getOrThrow(charge.categoryId) === subscriptionCategoryId
      )
    ).toBe(true);
    expect(
      coffeeAfter.every(
        (charge) =>
          Option.getOrThrow(charge.categoryId) ===
          categoryId("0192f0c1-0011-79f9-8c9a-c9af5a7eff0d")
      )
    ).toBe(true);

    const cleared = yield* categorise(
      cloudSubscriptionId,
      SubscriptionCategoryChangeSchema.cases.Clear.make({})
    );

    expect(Option.isNone(cleared.categoryId)).toBe(true);

    const clearedCharges = yield* store.charges(demoProfileId);

    expect(
      clearedCharges
        .filter((charge) => charge.payeeId === cloudPayeeId)
        .every((charge) => Option.isNone(charge.categoryId))
    ).toBe(true);

    const unknown = yield* categorise(
      cloudSubscriptionId,
      SubscriptionCategoryChangeSchema.cases.Assign.make({
        categoryId: categoryId("category-not-in-this-profile"),
      })
    ).pipe(Effect.flip);

    expect(unknown._tag).toBe("UnknownCategory");
  }).pipe(Effect.provide(asOwner))
);

it.effect("refuses an unknown repeat payment in this profile", () =>
  Effect.gen(function* refuseUnknown() {
    const missing = yield* cancel(
      subscriptionId("subscription-not-in-this-profile")
    ).pipe(Effect.flip);

    expect(missing._tag).toBe("UnknownSubscription");

    const unknownPayee = yield* markRepeatPayment
      .handler({
        frequency: "monthly",
        payeeId: payee("payee-without-history"),
        profileId: demoProfileId,
      })
      .pipe(Effect.flip);

    expect(Predicate.isTagged(unknownPayee, "NoRepeatPaymentFound")).toBe(true);

    if (Predicate.isTagged(unknownPayee, "NoRepeatPaymentFound")) {
      expect(unknownPayee.repair).toContain("`findRepeatPayments`");
    }
  }).pipe(Effect.provide(asOwner))
);

it.effect("keeps every repeat payment inside the profile that holds it", () =>
  Effect.gen(function* otherProfileCannotSee() {
    const scoped = yield* listSubscriptions.handler({
      filter: all,
      profileId: demoPersonalProfileId,
    });

    expect(scoped.subscriptions).toEqual([]);
    expect(scoped.activeAnnual).toEqual({ currency: "EUR", minor: 0 });

    const other = yield* changeSubscriptionStatus
      .handler({
        change: StatusChangeSchema.cases.Cancel.make({}),
        profileId: demoPersonalProfileId,
        subscriptionId: cloudSubscriptionId,
      })
      .pipe(Effect.flip);

    expect(other._tag).toBe("UnknownSubscription");
  }).pipe(Effect.provide(layerFor(bothProfilesPerson)))
);

it.effect("stops a viewer from writing and a stranger from reading", () =>
  Effect.gen(function* refuseViewerWrite() {
    const denied = yield* cancel(cloudSubscriptionId).pipe(Effect.flip);

    expect(denied._tag).toBe("Forbidden");

    const read = yield* listSubscriptions.handler(listRequest(all));

    expect(read.subscriptions).toHaveLength(2);
  }).pipe(Effect.provide(layerFor(demoViewer)))
);

it.effect("stops a person with no membership from reading a profile", () =>
  Effect.gen(function* refuseStrangerRead() {
    const denied = yield* listSubscriptions
      .handler(listRequest(active))
      .pipe(Effect.flip);

    expect(denied._tag).toBe("Forbidden");

    const write = yield* markRepeatPayment
      .handler(markDesignTool)
      .pipe(Effect.flip);

    expect(write._tag).toBe("Forbidden");
  }).pipe(Effect.provide(layerFor(demoStranger)))
);

it.effect("keeps the cancelled demo repeat payment out of active cost", () =>
  Effect.gen(function* cancelledStaysOut() {
    const everyNotice = yield* listSubscriptions.handler(listRequest(all));
    const cancelled = viewOf(everyNotice, coffeeSubscriptionId);

    expect(cancelled.cost.annual).toEqual({ currency: "EUR", minor: 221_000 });
    expect(cancelled.cost.monthly).toEqual({ currency: "EUR", minor: 18_416 });
    expect(everyNotice.activeAnnual).toEqual({
      currency: "EUR",
      minor: 358_800,
    });
    expect(everyNotice.activeMonthly).toEqual({
      currency: "EUR",
      minor: 29_900,
    });
  }).pipe(Effect.provide(asOwner))
);
