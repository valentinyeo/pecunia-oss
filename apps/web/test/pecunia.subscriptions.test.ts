import { describe, expect, it } from "@effect/vitest";
import { StatusChangeSchema } from "@pecunia/subscriptions";
import type { SubscriptionView } from "@pecunia/subscriptions";
import { Effect, Option, Schema } from "effect";

import { ChangeStatus } from "../src/client/pecunia/subscriptions/command.js";
import { SubscriptionsGateway } from "../src/client/pecunia/subscriptions/gateway.js";
import { Message as SubscriptionsMessage } from "../src/client/pecunia/subscriptions/message.js";
import type { SubscriptionsMessageValue } from "../src/client/pecunia/subscriptions/message.js";
import {
  activeFilter,
  allFilter,
  canCancel,
  canRestore,
  initialSubscriptions,
  nextChargeShown,
  pageOf,
  priorTagOf,
  remembering,
  restoreChangeOf,
  rowsOf,
  StatusChangeState,
  SubscriptionList,
  totalsOf,
} from "../src/client/pecunia/subscriptions/model.js";
import type {
  SubscriptionRoleValue,
  SubscriptionsScreenValue,
} from "../src/client/pecunia/subscriptions/model.js";
import {
  open as openSubscriptions,
  update as updateSubscriptions,
} from "../src/client/pecunia/subscriptions/update.js";
import {
  cancelledDemoPage,
  cancelledDemoRow,
  demoPage,
  demoRow,
} from "./pecunia-subscriptions-fixture.js";

const cancelCloud = StatusChangeSchema.cases.Cancel.make({});

const cloud = demoRow(allFilter, "Demo Cloud Hosting");

const coffee = demoRow(allFilter, "Demo Coffee");

const cancelledCloud = cancelledDemoRow(allFilter, "Demo Cloud Hosting");

const send = (
  screen: SubscriptionsScreenValue,
  message: SubscriptionsMessageValue,
  role: SubscriptionRoleValue = "owner"
) => updateSubscriptions(screen, role, message);

const loaded = (
  filter: typeof allFilter,
  generation: number,
  role: SubscriptionRoleValue = "owner"
): SubscriptionsScreenValue =>
  send(
    openSubscriptions(initialSubscriptions).model,
    SubscriptionsMessage.CompletedLoad({
      generation,
      page: demoPage(filter),
    }),
    role
  ).model;

const opened = (): SubscriptionsScreenValue =>
  openSubscriptions(initialSubscriptions).model;

const rowIds = (screen: SubscriptionsScreenValue): readonly string[] =>
  rowsOf(screen.list).map((row) => row.id);

const monthly = (screen: SubscriptionsScreenValue): Option.Option<number> =>
  Option.map(totalsOf(screen.list), (totals) => totals.monthly.minor);

describe("the subscriptions screen state", () => {
  it("opening subscriptions asks the service for the whole list", () => {
    const first = openSubscriptions(initialSubscriptions);

    expect(first.commands).toHaveLength(1);
    expect(first.commands?.[0]).toMatchObject({
      args: { filter: allFilter, generation: 2 },
      name: "LoadSubscriptions",
    });
    expect(SubscriptionList.guards.Loading(first.model.list)).toBe(true);
  });

  it("opening again keeps the page already loaded", () => {
    const screen = loaded(allFilter, 2);
    const reopened = openSubscriptions(screen);

    expect(reopened.model).toStrictEqual(screen);
    expect(reopened.commands).toBeUndefined();
  });

  it("a loaded page shows every repeat payment with its cost and total", () => {
    const screen = loaded(allFilter, 2);

    expect(rowIds(screen)).toStrictEqual([cloud.id, coffee.id]);
    expect(monthly(screen)).toStrictEqual(Option.some(29_900));
    expect(
      Option.map(totalsOf(screen.list), (totals) => totals.annual.minor)
    ).toStrictEqual(Option.some(358_800));
  });

  it("choosing the active filter asks for the counted repeat payments only", () => {
    const chosen = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.ChoseFilter({ filter: activeFilter })
    );

    expect(chosen.commands).toHaveLength(1);
    expect(chosen.commands?.[0]).toMatchObject({
      args: { filter: activeFilter, generation: 3 },
      name: "LoadSubscriptions",
    });
    expect(SubscriptionList.guards.Loading(chosen.model.list)).toBe(true);
  });

  it("choosing the filter already on screen sends nothing", () => {
    const chosen = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.ChoseFilter({ filter: allFilter })
    );

    expect(chosen.commands).toBeUndefined();
  });

  it("an owner cancelling a live repeat payment sends the cancellation", () => {
    const requested = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.RequestedCancel({ subscriptionId: cloud.id })
    );

    expect(requested.commands).toHaveLength(1);
    expect(requested.commands?.[0]).toMatchObject({
      args: { change: cancelCloud, subscriptionId: cloud.id },
      name: "ChangeStatus",
    });
    expect(requested.model.status).toStrictEqual(
      StatusChangeState.Sending({
        mode: "Cancel",
        payeeName: "Demo Cloud Hosting",
        subscriptionId: cloud.id,
      })
    );
  });

  it("a viewer cannot cancel a live repeat payment", () => {
    const screen = loaded(allFilter, 2, "viewer");

    const requested = send(
      screen,
      SubscriptionsMessage.RequestedCancel({ subscriptionId: cloud.id }),
      "viewer"
    );

    expect(requested.commands).toBeUndefined();
    expect(requested.model).toStrictEqual(screen);
    expect(canCancel("viewer", cloud)).toBe(false);
  });

  it("a cancelled repeat payment cannot be cancelled twice", () => {
    const screen = loaded(allFilter, 2);

    const requested = send(
      screen,
      SubscriptionsMessage.RequestedCancel({ subscriptionId: coffee.id })
    );

    expect(requested.commands).toBeUndefined();
    expect(requested.model).toStrictEqual(screen);
  });

  it("a second change while the first is in flight sends nothing", () => {
    const requested = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.RequestedCancel({ subscriptionId: cloud.id })
    );

    const again = send(
      requested.model,
      SubscriptionsMessage.RequestedRestore({ subscriptionId: coffee.id })
    );

    expect(again.commands).toBeUndefined();
    expect(again.model).toStrictEqual(requested.model);
  });

  it("a cancellation the service accepts reloads the page and reads out the notice", () => {
    const requested = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.RequestedCancel({ subscriptionId: cloud.id })
    );

    const completed = send(
      requested.model,
      SubscriptionsMessage.CompletedStatus({ view: cancelledCloud })
    );

    expect(completed.commands).toHaveLength(1);
    expect(completed.commands?.[0]).toMatchObject({
      args: { filter: allFilter, generation: 3 },
      name: "LoadSubscriptions",
    });
    expect(SubscriptionList.guards.Loading(completed.model.list)).toBe(true);
    expect(completed.model.status).toStrictEqual(
      StatusChangeState.Done({
        notice:
          "Cancelled Demo Cloud Hosting. Nothing is cancelled at the merchant, and no money moves.",
      })
    );

    const reloaded = send(
      completed.model,
      SubscriptionsMessage.CompletedLoad({
        generation: 3,
        page: cancelledDemoPage(allFilter),
      })
    );

    expect(monthly(reloaded.model)).toStrictEqual(Option.some(0));
    expect(rowIds(reloaded.model).length).toBe(2);
  });

  it("a cancellation for a row the screen is not sending is ignored", () => {
    const requested = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.RequestedCancel({ subscriptionId: cloud.id })
    );

    const unrelated = send(
      requested.model,
      SubscriptionsMessage.CompletedStatus({
        view: cancelledDemoRow(allFilter, "Demo Coffee"),
      })
    );

    expect(unrelated.commands).toBeUndefined();
    expect(unrelated.model).toStrictEqual(requested.model);
  });

  it("a restore is offered only for a repeat payment cancelled on this screen", () => {
    expect(canRestore("owner", [], cloud)).toBe(false);
    expect(canRestore("owner", [], coffee)).toBe(false);

    const remembered = remembering([], cloud);

    expect(priorTagOf(remembered, cloud.id)).toStrictEqual(
      Option.some("Confirmed")
    );
    expect(
      priorTagOf(remembering(remembered, cancelledCloud), cloud.id)
    ).toStrictEqual(Option.some("Confirmed"));
    expect(restoreChangeOf(remembered, cancelledCloud)).toStrictEqual(
      Option.some(StatusChangeSchema.cases.Restore.make({ to: "Confirmed" }))
    );
  });

  it("restoring a repeat payment cancelled here sends the notice it held", () => {
    const requested = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.RequestedCancel({ subscriptionId: cloud.id })
    );

    const reloaded = send(
      send(
        requested.model,
        SubscriptionsMessage.CompletedStatus({ view: cancelledCloud })
      ).model,
      SubscriptionsMessage.CompletedLoad({
        generation: 3,
        page: cancelledDemoPage(allFilter),
      })
    );

    const restored = send(
      reloaded.model,
      SubscriptionsMessage.RequestedRestore({ subscriptionId: cloud.id })
    );

    expect(restored.commands).toHaveLength(1);
    expect(restored.commands?.[0]).toMatchObject({
      args: {
        change: StatusChangeSchema.cases.Restore.make({ to: "Confirmed" }),
        subscriptionId: cloud.id,
      },
      name: "ChangeStatus",
    });
  });

  it("a cancelled repeat payment loaded from the service offers no restore", () => {
    const screen = loaded(allFilter, 2);

    const restored = send(
      screen,
      SubscriptionsMessage.RequestedRestore({ subscriptionId: coffee.id })
    );

    expect(restored.commands).toBeUndefined();
    expect(restored.model).toStrictEqual(screen);
  });

  it("a refused change says what to fix and keeps the page", () => {
    const requested = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.RequestedCancel({ subscriptionId: cloud.id })
    );

    const failed = send(
      requested.model,
      SubscriptionsMessage.FailedStatus({
        reason:
          "Repeat payment 0192f0c1-0033-7362-801a-01a8162ef271 is Confirmed, so there is no cancellation to undo. Fix: reload `/app/subscriptions`.",
        subscriptionId: cloud.id,
      })
    );

    expect(StatusChangeState.guards.Failed(failed.model.status)).toBe(true);
    expect(rowIds(failed.model)).toStrictEqual([cloud.id, coffee.id]);
    expect(monthly(failed.model)).toStrictEqual(Option.some(29_900));
  });

  it("a refused change for a row the screen is not sending is ignored", () => {
    const requested = send(
      loaded(allFilter, 2),
      SubscriptionsMessage.RequestedCancel({ subscriptionId: cloud.id })
    );

    const unrelated = send(
      requested.model,
      SubscriptionsMessage.FailedStatus({
        reason: "The repeat payments could not be read. Fix: try again.",
        subscriptionId: coffee.id,
      })
    );

    expect(unrelated.model).toStrictEqual(requested.model);
  });

  it("a failed load says what to fix and retrying asks again with a new generation", () => {
    const failed = send(
      opened(),
      SubscriptionsMessage.FailedLoad({
        generation: 2,
        reason: "The repeat payments could not be read. Fix: try again.",
      })
    );

    expect(SubscriptionList.guards.Failed(failed.model.list)).toBe(true);

    const retried = send(failed.model, SubscriptionsMessage.Retried());

    expect(retried.commands?.[0]).toMatchObject({
      args: { filter: allFilter, generation: 3 },
      name: "LoadSubscriptions",
    });
    expect(SubscriptionList.guards.Loading(retried.model.list)).toBe(true);
  });

  it("a load for an older generation never replaces the page", () => {
    const screen = loaded(allFilter, 2);

    const stale = send(
      screen,
      SubscriptionsMessage.CompletedLoad({
        generation: 1,
        page: demoPage(activeFilter),
      })
    );

    expect(stale.model).toStrictEqual(screen);
  });

  it("a cancelled repeat payment has no next charge and a live one does", () => {
    expect(Option.isSome(nextChargeShown(cloud))).toBe(true);
    expect(Option.isNone(nextChargeShown(coffee))).toBe(true);
    expect(Option.isNone(nextChargeShown(cancelledCloud))).toBe(true);
  });

  it("the shown page is the one the service returned", () => {
    const screen = loaded(allFilter, 2);

    expect(pageOf(screen.list)).toStrictEqual(Option.some(demoPage(allFilter)));
  });
});

describe("the subscriptions service behind the screen", () => {
  it.effect(
    "cancelling through the screen state changes the stored notice",
    () =>
      Effect.gen(function* cancelThroughTheGateway() {
        const gateway = yield* SubscriptionsGateway;

        const completed = yield* ChangeStatus({
          change: cancelCloud,
          subscriptionId: cloud.id,
        }).effect;

        expect(Schema.is(SubscriptionsMessage.CompletedStatus)(completed)).toBe(
          true
        );

        const page = yield* gateway.list(allFilter);

        const row = page.subscriptions.find(
          (candidate) => candidate.id === cloud.id
        );

        expect(row?.status._tag).toBe("Cancelled");
        expect(
          Option.isNone(row?.nextCharge ?? Option.some("2026-01-08"))
        ).toBe(true);
        expect(page.activeMonthly.minor).toBe(0);
        expect(page.activeAnnual.minor).toBe(0);
      }).pipe(Effect.provide(SubscriptionsGateway.layer))
  );

  it.effect("a cancellation can be restored to the notice it held", () =>
    Effect.gen(function* restoreThroughTheGateway() {
      yield* ChangeStatus({
        change: cancelCloud,
        subscriptionId: cloud.id,
      }).effect;

      const restored = yield* ChangeStatus({
        change: StatusChangeSchema.cases.Restore.make({ to: "Confirmed" }),
        subscriptionId: cloud.id,
      }).effect;

      expect(Schema.is(SubscriptionsMessage.CompletedStatus)(restored)).toBe(
        true
      );

      if (Schema.is(SubscriptionsMessage.CompletedStatus)(restored)) {
        expect(restored.view.status._tag).toBe("Confirmed");
      }
    }).pipe(Effect.provide(SubscriptionsGateway.layer))
  );

  it.effect("restoring a live repeat payment is refused with a fix", () =>
    Effect.gen(function* refuseRestoreLive() {
      const refused = yield* ChangeStatus({
        change: StatusChangeSchema.cases.Restore.make({ to: "Confirmed" }),
        subscriptionId: cloud.id,
      }).effect;

      expect(Schema.is(SubscriptionsMessage.FailedStatus)(refused)).toBe(true);

      if (Schema.is(SubscriptionsMessage.FailedStatus)(refused)) {
        expect(refused.reason).toContain("no cancellation to undo");
        expect(refused.reason).toContain("Fix:");
      }
    }).pipe(Effect.provide(SubscriptionsGateway.layer))
  );

  it.effect(
    "the list reads the demo profile's repeat payments in minor units",
    () =>
      Effect.gen(function* readTheList() {
        const gateway = yield* SubscriptionsGateway;
        const page = yield* gateway.list(allFilter);

        expect(page.baseCurrency).toBe("EUR");
        expect(page.subscriptions.map((row) => row.payeeName)).toStrictEqual([
          "Demo Cloud Hosting",
          "Demo Coffee",
        ]);
        expect(
          page.subscriptions.map(
            (row: SubscriptionView) => row.cost.monthly.minor
          )
        ).toStrictEqual([29_900, 18_416]);
      }).pipe(Effect.provide(SubscriptionsGateway.layer))
  );
});
