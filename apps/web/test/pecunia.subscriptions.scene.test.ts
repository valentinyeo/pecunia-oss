import { it } from "@effect/vitest";
import { StatusChangeSchema } from "@pecunia/subscriptions";
import { Option } from "effect";
import * as Scene from "foldkit/scene";
import { fromString } from "foldkit/url";

import { Message } from "../src/client/pecunia/message.js";
import { initialModel } from "../src/client/pecunia/model.js";
import {
  ChangeStatus,
  LoadSubscriptions,
} from "../src/client/pecunia/subscriptions/command.js";
import { Message as SubscriptionsMessage } from "../src/client/pecunia/subscriptions/message.js";
import {
  activeFilter,
  allFilter,
} from "../src/client/pecunia/subscriptions/model.js";
import { update, view } from "../src/features/pecunia/app.js";
import {
  cancelledDemoPage,
  cancelledDemoRow,
  demoPage,
  demoRow,
} from "./pecunia-subscriptions-fixture.js";

const url = (path: string) =>
  Option.getOrThrow(fromString(`https://pecunia.test${path}`));

const openSubscriptions = Scene.Subscription.emit(
  Message.ChangedUrl({ url: url("/app/subscriptions") })
);

const cloud = demoRow(allFilter, "Demo Cloud Hosting");

const coffee = demoRow(allFilter, "Demo Coffee");

const cancelCloud = StatusChangeSchema.cases.Cancel.make({});

const loadAll = (generation: number) =>
  LoadSubscriptions({ filter: allFilter, generation });

const loadedAll = (generation: number) =>
  Scene.Command.resolve(
    LoadSubscriptions,
    SubscriptionsMessage.CompletedLoad({
      generation,
      page: demoPage(allFilter),
    })
  );

const loadedCancelled = (generation: number) =>
  Scene.Command.resolve(
    LoadSubscriptions,
    SubscriptionsMessage.CompletedLoad({
      generation,
      page: cancelledDemoPage(allFilter),
    })
  );

const monthlyTotal = Scene.selector('[data-total="monthly"]');

const annualTotal = Scene.selector('[data-total="annual"]');

const cloudRow = Scene.selector(`[data-subscription="${cloud.id}"]`);

it("an owner cancels a repeat payment and the screen stops counting it", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openSubscriptions,
    Scene.Command.expectExact(loadAll(2)),
    loadedAll(2),
    Scene.expect(Scene.role("heading", { name: "Subscriptions" })).toExist(),
    Scene.expect(cloudRow).toHaveAttr("data-status", "Confirmed"),
    Scene.expect(Scene.text("Demo Cloud Hosting")).toExist(),
    Scene.expect(Scene.text("Demo Coffee")).toExist(),
    Scene.expect(Scene.text("Next charge 8 Jan 2026")).toExist(),
    Scene.expect(monthlyTotal).toHaveText("€299.00"),
    Scene.expect(annualTotal).toHaveText("€3,588.00"),
    Scene.click(Scene.role("button", { name: "Cancel Demo Cloud Hosting" })),
    Scene.Command.expectExact(
      ChangeStatus({ change: cancelCloud, subscriptionId: cloud.id })
    ),
    Scene.expect(Scene.text("Cancelling Demo Cloud Hosting…")).toExist(),
    Scene.Command.resolve(
      ChangeStatus,
      SubscriptionsMessage.CompletedStatus({
        view: cancelledDemoRow(allFilter, "Demo Cloud Hosting"),
      })
    ),
    Scene.expect(
      Scene.text(
        "Cancelled Demo Cloud Hosting. Nothing is cancelled at the merchant, and no money moves."
      )
    ).toExist(),
    Scene.Command.expectExact(loadAll(3)),
    loadedCancelled(3),
    Scene.expect(cloudRow).toHaveAttr("data-status", "Cancelled"),
    Scene.expect(Scene.text("Next charge 8 Jan 2026")).toBeAbsent(),
    Scene.expect(monthlyTotal).toHaveText("€0.00"),
    Scene.expect(annualTotal).toHaveText("€0.00"),
    Scene.expect(
      Scene.role("button", { name: "Cancel Demo Cloud Hosting" })
    ).toBeAbsent(),
    Scene.expect(
      Scene.role("button", { name: "Restore Demo Cloud Hosting" })
    ).toExist()
  );
});

it("a cancelled repeat payment that was never live here offers no restore", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openSubscriptions,
    loadedAll(2),
    Scene.expect(
      Scene.role("button", { name: "Restore Demo Coffee" })
    ).toBeAbsent(),
    Scene.expect(
      Scene.role("button", { name: `Cancel ${coffee.payeeName}` })
    ).toBeAbsent()
  );
});

it("the active filter asks the service for the counted repeat payments only", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openSubscriptions,
    loadedAll(2),
    Scene.click(Scene.role("button", { name: "Active" })),
    Scene.Command.expectExact(
      LoadSubscriptions({ filter: activeFilter, generation: 3 })
    ),
    Scene.Command.resolve(
      LoadSubscriptions,
      SubscriptionsMessage.CompletedLoad({
        generation: 3,
        page: demoPage(activeFilter),
      })
    ),
    Scene.expect(Scene.text("Demo Cloud Hosting")).toExist(),
    Scene.expect(Scene.text("Demo Coffee")).toBeAbsent(),
    Scene.expect(monthlyTotal).toHaveText("€299.00")
  );
});

it("a viewer reads the repeat payments and cannot cancel one", () => {
  Scene.scene(
    { update, view },
    Scene.given({ ...initialModel, access: "viewer" }),
    openSubscriptions,
    loadedAll(2),
    Scene.expect(Scene.text("Demo Cloud Hosting")).toExist(),
    Scene.expect(
      Scene.text(
        "Read-only. Only an owner can cancel or restore a repeat payment."
      )
    ).toExist(),
    Scene.expect(
      Scene.role("button", { name: "Cancel Demo Cloud Hosting" })
    ).toBeAbsent()
  );
});
