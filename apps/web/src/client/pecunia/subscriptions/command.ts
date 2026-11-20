import {
  StatusChangeSchema,
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
} from "@pecunia/subscriptions";
import { Effect } from "effect";
import { Command } from "foldkit";

import { SubscriptionsGateway } from "./gateway.js";
import { Message } from "./message.js";
import { Generation } from "./model.js";

export const LoadSubscriptions = Command.define("LoadSubscriptions", {
  args: { filter: SubscriptionFilterSchema, generation: Generation },
  execute: ({ filter, generation }) =>
    SubscriptionsGateway.use((gateway) => gateway.list(filter)).pipe(
      Effect.match({
        onFailure: (failure) =>
          Message.FailedLoad({ generation, reason: failure.message }),
        onSuccess: (page) => Message.CompletedLoad({ generation, page }),
      })
    ),
  messages: [Message.CompletedLoad, Message.FailedLoad],
});

export const ChangeStatus = Command.define("ChangeStatus", {
  args: { change: StatusChangeSchema, subscriptionId: SubscriptionIdSchema },
  execute: ({ change, subscriptionId }) =>
    SubscriptionsGateway.use((gateway) =>
      gateway.changeStatus({ change, subscriptionId })
    ).pipe(
      Effect.match({
        onFailure: (failure) =>
          Message.FailedStatus({
            reason: failure.message,
            subscriptionId,
          }),
        onSuccess: (view) => Message.CompletedStatus({ view }),
      })
    ),
  messages: [Message.CompletedStatus, Message.FailedStatus],
});
