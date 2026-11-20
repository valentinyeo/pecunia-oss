import { CurrentPerson, Forbidden } from "@pecunia/access";
import { SubscriptionService } from "@pecunia/subscriptions";
import type {
  BaseCurrencyMismatch,
  IllegalStatusChange,
  StatusChange,
  SubscriptionCostOverflow,
  SubscriptionFilter,
  SubscriptionId,
  SubscriptionPage,
  SubscriptionStoreError,
  SubscriptionView,
  UnknownCategory,
  UnknownSubscription,
} from "@pecunia/subscriptions";
import {
  changeSubscriptionStatus,
  listSubscriptions,
} from "@pecunia/subscriptions/capabilities";
import {
  demoPerson,
  demoProfileId,
  demoSubscriptionSeed,
} from "@pecunia/subscriptions/demo";
import { memorySubscriptionStoreLayer } from "@pecunia/subscriptions/memory";
import { Context, Effect, Layer, Schema } from "effect";

import { SubscriptionsGatewayFailure } from "./gateway-failure.js";

type StoredFailure =
  | BaseCurrencyMismatch
  | IllegalStatusChange
  | SubscriptionCostOverflow
  | SubscriptionStoreError
  | UnknownCategory
  | UnknownSubscription
  | Forbidden;

const repaired = (
  failure: StoredFailure | SubscriptionsGatewayFailure
): SubscriptionsGatewayFailure => {
  if (Schema.is(SubscriptionsGatewayFailure)(failure)) {
    return failure;
  }

  if (Schema.is(Forbidden)(failure)) {
    return new SubscriptionsGatewayFailure({
      cause: failure,
      message: `${failure.message}. Fix: ask an owner of this profile for access, then reload the screen.`,
    });
  }

  return new SubscriptionsGatewayFailure({
    cause: failure,
    message: `${failure.message} Fix: ${failure.repair}`,
  });
};

const demoWorld = Layer.mergeAll(
  SubscriptionService.layer.pipe(
    Layer.provide(memorySubscriptionStoreLayer(demoSubscriptionSeed))
  ),
  Layer.succeed(CurrentPerson, demoPerson)
);

export interface ChangeStatusRequest {
  readonly change: StatusChange;
  readonly subscriptionId: SubscriptionId;
}

const make = Effect.gen(function* makeSubscriptionsGateway() {
  const service = yield* SubscriptionService;
  const person = yield* CurrentPerson;

  const dependencies = Layer.mergeAll(
    Layer.succeed(SubscriptionService, service),
    Layer.succeed(CurrentPerson, person)
  );

  const list = (filter: SubscriptionFilter) =>
    listSubscriptions
      .handler({ filter, profileId: demoProfileId })
      .pipe(Effect.mapError(repaired), Effect.provide(dependencies));

  const changeStatus = (request: ChangeStatusRequest) =>
    changeSubscriptionStatus
      .handler({
        change: request.change,
        profileId: demoProfileId,
        subscriptionId: request.subscriptionId,
      })
      .pipe(Effect.mapError(repaired), Effect.provide(dependencies));

  return { changeStatus, list } as const;
});

export class SubscriptionsGateway extends Context.Service<
  SubscriptionsGateway,
  {
    readonly changeStatus: (
      request: ChangeStatusRequest
    ) => Effect.Effect<SubscriptionView, SubscriptionsGatewayFailure>;
    readonly list: (
      filter: SubscriptionFilter
    ) => Effect.Effect<SubscriptionPage, SubscriptionsGatewayFailure>;
  }
>()("@pecunia/web/SubscriptionsGateway", { make }) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(demoWorld)
  );
}
