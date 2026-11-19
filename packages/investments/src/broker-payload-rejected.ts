import { Schema } from "effect";

import { BrokerAccountIdSchema } from "./model.js";

export class BrokerPayloadRejected extends Schema.TaggedError<
  BrokerPayloadRejected,
  { readonly brand: unique symbol }
>()("BrokerPayloadRejected", {
  accountId: BrokerAccountIdSchema,
  field: Schema.String,
  message: Schema.String,
  repair: Schema.String,
}) {}
