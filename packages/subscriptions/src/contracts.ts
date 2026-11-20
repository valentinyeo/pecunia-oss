import { Forbidden } from "@pecunia/access";
import { defineContract } from "@pecunia/capability/contract";
import { Schema } from "effect";

import { BaseCurrencyMismatch } from "./base-currency-mismatch.js";
import { IllegalStatusChange } from "./illegal-status-change.js";
import {
  ChangeSubscriptionStatusRequestSchema,
  FindRepeatPaymentsRequestSchema,
  ListSubscriptionsRequestSchema,
  MarkRepeatPaymentRequestSchema,
  RepeatPaymentPageSchema,
  SetSubscriptionCategoryRequestSchema,
  SubscriptionPageSchema,
  SubscriptionViewSchema,
} from "./model.js";
import { NoRepeatPaymentFound } from "./no-repeat-payment-found.js";
import { SubscriptionCostOverflow } from "./subscription-cost-overflow.js";
import { SubscriptionStoreError } from "./subscription-store-error.js";
import { UnknownCategory } from "./unknown-category.js";
import { UnknownSubscription } from "./unknown-subscription.js";

export const listSubscriptionsContract = defineContract("listSubscriptions", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List a profile's repeat payments with the monthly and annual cost of each, in the profile's base currency and integer minor units. The annual cost is the typical base charge taken 52 times a year for weekly, 12 for monthly, 4 for quarterly and 1 for annual. The monthly cost is that annual cost divided by twelve and rounded down, so the rows add up to the total. Only confirmed and detected repeat payments count towards active cost; a cancelled, dismissed or not-recurring one is listed with no next charge. Filter Active keeps the counted ones, All lists every notice.",
  failure: Schema.Union([
    SubscriptionStoreError,
    SubscriptionCostOverflow,
    BaseCurrencyMismatch,
    Forbidden,
  ]),
  input: ListSubscriptionsRequestSchema,
  output: SubscriptionPageSchema,
});

export const findRepeatPaymentsContract = defineContract("findRepeatPayments", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "Find repeat payments in a profile's outgoing payment history without writing anything. A payee is claimed only when it has at least three outgoing payments, a known payee row, and a median gap inside one of the four frequency bands: weekly 5 to 9 days, monthly 25 to 35, quarterly 80 to 100, annual 350 to 380. The typical charge is the median payment of that payee in its most-used currency, never a sum. Confidence is one minus the worst gap's distance from the frequency's nominal length. Incoming payments are ignored.",
  failure: Schema.Union([SubscriptionStoreError, Forbidden]),
  input: FindRepeatPaymentsRequestSchema,
  output: RepeatPaymentPageSchema,
});

export const markRepeatPaymentContract = defineContract("markRepeatPayment", {
  annotations: { idempotent: true },
  description:
    "Mark one payee as a repeat payment of one profile. The typical charge, the last charge and the confidence come from the payee's outgoing payment history; the frequency comes from the caller. Marking a payee that already holds a repeat payment confirms that row instead of creating a second one, so a profile holds one repeat payment per payee.",
  failure: Schema.Union([
    SubscriptionStoreError,
    NoRepeatPaymentFound,
    SubscriptionCostOverflow,
    BaseCurrencyMismatch,
    Forbidden,
  ]),
  input: MarkRepeatPaymentRequestSchema,
  output: SubscriptionViewSchema,
});

export const changeSubscriptionStatusContract = defineContract(
  "changeSubscriptionStatus",
  {
    annotations: { idempotent: true },
    description:
      "Change one repeat payment's notice for one profile: confirm it, dismiss it, mark it recurring, mark it not recurring, cancel it, or restore a cancellation to the notice it held. The notice keeps the time it changed, and sending the notice a row already holds keeps the first time. Restore is refused as IllegalStatusChange unless the row is cancelled, so a live repeat payment cannot be restored. Cancelling is a notice in this profile only: nothing is cancelled at the merchant and no money moves.",
    failure: Schema.Union([
      SubscriptionStoreError,
      IllegalStatusChange,
      UnknownSubscription,
      SubscriptionCostOverflow,
      BaseCurrencyMismatch,
      Forbidden,
    ]),
    input: ChangeSubscriptionStatusRequestSchema,
    output: SubscriptionViewSchema,
  }
);

export const setSubscriptionCategoryContract = defineContract(
  "setSubscriptionCategory",
  {
    annotations: { idempotent: true },
    description:
      "Set or clear one repeat payment's category for one profile, and push that same category onto every past payment of its payee in the profile. An assigned category must be a live category of the profile. Clearing the category clears the past payments too.",
    failure: Schema.Union([
      SubscriptionStoreError,
      UnknownSubscription,
      UnknownCategory,
      SubscriptionCostOverflow,
      BaseCurrencyMismatch,
      Forbidden,
    ]),
    input: SetSubscriptionCategoryRequestSchema,
    output: SubscriptionViewSchema,
  }
);

export const subscriptionContracts = [
  listSubscriptionsContract,
  findRepeatPaymentsContract,
  markRepeatPaymentContract,
  changeSubscriptionStatusContract,
  setSubscriptionCategoryContract,
] as const;
