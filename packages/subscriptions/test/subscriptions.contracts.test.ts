import { toRpcGroup } from "@pecunia/capability/rpc-group";
import { Schema } from "effect";
import { expect, it } from "vitest";

import { subscriptionCapabilities } from "../src/capabilities.js";
import { subscriptionContracts } from "../src/contracts.js";
import {
  CategoryIdSchema,
  ChangeSubscriptionStatusRequestSchema,
  DateOnlySchema,
  ListSubscriptionsRequestSchema,
  MarkRepeatPaymentRequestSchema,
  PaymentSchema,
  SetSubscriptionCategoryRequestSchema,
  StatusChangeSchema,
  StatusSchema,
  SubscriptionCategoryChangeSchema,
  SubscriptionFilterSchema,
} from "../src/model.js";

const demoProfile = "0192f0c1-0001-702d-8484-48490b729601";

const demoSubscription = "0192f0c1-0033-7362-801a-01a8162ef271";

const demoPayee = "0192f0c1-0009-71f7-8998-998f8330df68";

const demoCategory = Schema.decodeSync(CategoryIdSchema)(
  "0192f0c1-000f-755b-8ae4-ae47d20b52cf"
);

const listRequest = {
  filter: SubscriptionFilterSchema.cases.Active.make({}),
  profileId: demoProfile,
};

const markRequest = {
  frequency: "monthly" as const,
  payeeId: demoPayee,
  profileId: demoProfile,
};

const cancelRequest = {
  change: StatusChangeSchema.cases.Cancel.make({}),
  profileId: demoProfile,
  subscriptionId: demoSubscription,
};

const restoreRequest = {
  change: StatusChangeSchema.cases.Restore.make({ to: "Confirmed" as const }),
  profileId: demoProfile,
  subscriptionId: demoSubscription,
};

const categoryRequest = {
  category: SubscriptionCategoryChangeSchema.cases.Assign.make({
    categoryId: demoCategory,
  }),
  profileId: demoProfile,
  subscriptionId: demoSubscription,
};

const decodeList = (value: Schema.Json) =>
  Schema.decodeUnknownResult(ListSubscriptionsRequestSchema)(value);

const decodeMark = (value: Schema.Json) =>
  Schema.decodeUnknownResult(MarkRepeatPaymentRequestSchema)(value);

const decodeStatus = (value: Schema.Json) =>
  Schema.decodeUnknownResult(ChangeSubscriptionStatusRequestSchema)(value);

const decodeCategory = (value: Schema.Json) =>
  Schema.decodeUnknownResult(SetSubscriptionCategoryRequestSchema)(value);

it("parses plain repeat payment requests at the boundary", () => {
  expect(decodeList(listRequest)._tag).toBe("Success");
  expect(
    decodeList({
      filter: SubscriptionFilterSchema.cases.All.make({}),
      profileId: demoProfile,
    })._tag
  ).toBe("Success");
  expect(decodeMark(markRequest)._tag).toBe("Success");
  expect(decodeStatus(cancelRequest)._tag).toBe("Success");
  expect(decodeStatus(restoreRequest)._tag).toBe("Success");
  expect(decodeCategory(categoryRequest)._tag).toBe("Success");
});

it("refuses a filter member the union does not name", () => {
  expect(
    decodeList({
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      filter: { _tag: "Some" },
      profileId: demoProfile,
    })._tag
  ).toBe("Failure");

  expect(decodeList({ ...listRequest, profileId: "" })._tag).toBe("Failure");
});

it("refuses a frequency the table does not name", () => {
  expect(decodeMark({ ...markRequest, frequency: "daily" })._tag).toBe(
    "Failure"
  );
  expect(decodeMark({ ...markRequest, payeeId: "" })._tag).toBe("Failure");
});

it("refuses a restore back to cancelled", () => {
  expect(
    decodeStatus({
      ...cancelRequest,
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      change: { _tag: "Restore", to: "Cancelled" },
    })._tag
  ).toBe("Failure");

  expect(
    decodeStatus({
      ...cancelRequest,
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      change: { _tag: "Restore" },
    })._tag
  ).toBe("Failure");

  expect(
    decodeStatus({
      ...cancelRequest,
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      change: { _tag: "Delete" },
    })._tag
  ).toBe("Failure");
});

it("refuses a category change that names no category", () => {
  expect(
    decodeCategory({
      ...categoryRequest,
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      category: { _tag: "Assign" },
    })._tag
  ).toBe("Failure");

  expect(
    decodeCategory({
      ...categoryRequest,
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      category: { _tag: "Set" },
    })._tag
  ).toBe("Failure");
});

it("refuses money that is not an integer payment or a date that is not on the calendar", () => {
  const payment = Schema.decodeUnknownResult(PaymentSchema);
  const date = Schema.decodeUnknownResult(DateOnlySchema);

  expect(payment({ currency: "EUR", minor: 0 })._tag).toBe("Failure");
  expect(payment({ currency: "EUR", minor: -1 })._tag).toBe("Failure");
  expect(payment({ currency: "EUR", minor: 1.5 })._tag).toBe("Failure");
  expect(payment({ currency: "eur", minor: 100 })._tag).toBe("Failure");
  expect(payment({ currency: "EUR", minor: 100 })._tag).toBe("Success");

  expect(date("2025-02-30")._tag).toBe("Failure");
  expect(date("2025-12-08")._tag).toBe("Success");
});

it("refuses a notice without the time it changed", () => {
  expect(
    Schema.decodeUnknownResult(StatusSchema)({
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      _tag: "Confirmed",
    })._tag
  ).toBe("Failure");

  expect(
    Schema.decodeUnknownResult(StatusSchema)({
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- A wire payload this test decodes, not a domain value.
      _tag: "Confirmed",
      at: 1_765_000_000_000,
    })._tag
  ).toBe("Success");
});

it("projects the five contracts onto one RPC group", () => {
  const { group } = toRpcGroup(subscriptionContracts);

  expect([...group.requests.keys()]).toEqual([
    "listSubscriptions",
    "findRepeatPayments",
    "markRepeatPayment",
    "changeSubscriptionStatus",
    "setSubscriptionCategory",
  ]);

  expect(
    subscriptionCapabilities.map((capability) => capability.contract.name)
  ).toEqual([...group.requests.keys()]);
});

it("marks the two reads read-only and asks for no approval", () => {
  const annotations = Object.fromEntries(
    subscriptionContracts.map((contract) => [
      contract.name,
      contract.annotations,
    ])
  );

  expect(annotations.listSubscriptions?.readOnly).toBe(true);
  expect(annotations.findRepeatPayments?.readOnly).toBe(true);
  expect(annotations.markRepeatPayment?.idempotent).toBe(true);
  expect(annotations.changeSubscriptionStatus?.idempotent).toBe(true);
  expect(annotations.setSubscriptionCategory?.idempotent).toBe(true);
  expect(
    subscriptionContracts.every((contract) => !contract.needsApproval)
  ).toBe(true);
});
