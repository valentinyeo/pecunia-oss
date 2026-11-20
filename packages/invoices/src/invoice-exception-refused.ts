import { Schema } from "effect";

import { ProfileIdSchema, TransactionIdSchema } from "./model.js";

export class InvoiceExceptionRefused extends Schema.TaggedError<
  InvoiceExceptionRefused,
  { readonly brand: unique symbol }
>()("InvoiceExceptionRefused", {
  message: Schema.String,
  profileId: ProfileIdSchema,
  reasonLength: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  repair: Schema.String,
  transactionId: TransactionIdSchema,
}) {}
