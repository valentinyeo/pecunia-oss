import { Schema } from "effect";

import { BrokerAccountIdSchema } from "./model.js";

export class BrokerUnavailable extends Schema.TaggedError<
  BrokerUnavailable,
  { readonly brand: unique symbol }
>()("BrokerUnavailable", {
  accountId: BrokerAccountIdSchema,
  message: Schema.String,
  repair: Schema.String,
}) {}
