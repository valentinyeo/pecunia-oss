import {
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
  SubscriptionPageSchema,
  SubscriptionViewSchema,
} from "@pecunia/subscriptions";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { Generation } from "./model.js";

export const Message = defineMessageUnion({
  ChoseFilter: { filter: SubscriptionFilterSchema },
  CompletedLoad: { generation: Generation, page: SubscriptionPageSchema },
  CompletedStatus: { view: SubscriptionViewSchema },
  FailedLoad: { generation: Generation, reason: Schema.NonEmptyString },
  FailedStatus: {
    reason: Schema.NonEmptyString,
    subscriptionId: SubscriptionIdSchema,
  },
  RequestedCancel: { subscriptionId: SubscriptionIdSchema },
  RequestedRestore: { subscriptionId: SubscriptionIdSchema },
  Retried: {},
});

export type SubscriptionsMessageValue = typeof Message.Type;
