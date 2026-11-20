import { Schema } from "effect";

import { ProfileIdSchema, TransactionIdSchema } from "./model.js";

export class UnknownPayment extends Schema.TaggedError<
  UnknownPayment,
  { readonly brand: unique symbol }
>()("UnknownPayment", {
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  transactionId: TransactionIdSchema,
}) {}
