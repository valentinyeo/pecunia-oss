import { Schema } from "effect";

import {
  StatusChangeSchema,
  StatusTagSchema,
  SubscriptionIdSchema,
} from "./model.js";

export class IllegalStatusChange extends Schema.TaggedError<
  IllegalStatusChange,
  { readonly brand: unique symbol }
>()("IllegalStatusChange", {
  change: StatusChangeSchema,
  current: StatusTagSchema,
  message: Schema.String,
  repair: Schema.String,
  subscriptionId: SubscriptionIdSchema,
}) {}
