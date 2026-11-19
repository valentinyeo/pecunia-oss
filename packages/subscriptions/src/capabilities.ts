import { CurrentPerson } from "@pecunia/access";
import { implement } from "@pecunia/capability/implement";
import { Effect } from "effect";

import {
  changeSubscriptionStatusContract,
  findRepeatPaymentsContract,
  listSubscriptionsContract,
  markRepeatPaymentContract,
  setSubscriptionCategoryContract,
} from "./contracts.js";
import { readScopeOf, writeScopeOf } from "./scope.js";
import { SubscriptionService } from "./service.js";

export const listSubscriptions = implement(
  listSubscriptionsContract,
  ({ filter, profileId }) =>
    Effect.gen(function* listProfileSubscriptions() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* SubscriptionService;

      return yield* service.list(scope, { filter });
    })
);

export const findRepeatPayments = implement(
  findRepeatPaymentsContract,
  ({ profileId }) =>
    Effect.gen(function* findProfileRepeatPayments() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* SubscriptionService;

      return yield* service.find(scope);
    })
);

export const markRepeatPayment = implement(
  markRepeatPaymentContract,
  ({ frequency, payeeId, profileId }) =>
    Effect.gen(function* markProfileRepeatPayment() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* SubscriptionService;

      return yield* service.mark(scope, { frequency, payeeId });
    })
);

export const changeSubscriptionStatus = implement(
  changeSubscriptionStatusContract,
  ({ change, profileId, subscriptionId }) =>
    Effect.gen(function* changeProfileSubscriptionStatus() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* SubscriptionService;

      return yield* service.changeStatus(scope, { change, subscriptionId });
    })
);

export const setSubscriptionCategory = implement(
  setSubscriptionCategoryContract,
  ({ category, profileId, subscriptionId }) =>
    Effect.gen(function* setProfileSubscriptionCategory() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* SubscriptionService;

      return yield* service.setCategory(scope, { category, subscriptionId });
    })
);

export const subscriptionCapabilities = [
  listSubscriptions,
  findRepeatPayments,
  markRepeatPayment,
  changeSubscriptionStatus,
  setSubscriptionCategory,
] as const;
