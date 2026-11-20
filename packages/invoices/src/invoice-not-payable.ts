import { Schema } from "effect";

import {
  DirectionSchema,
  ProfileIdSchema,
  TransactionIdSchema,
} from "./model.js";

export class InvoiceNotPayable extends Schema.TaggedError<
  InvoiceNotPayable,
  { readonly brand: unique symbol }
>()("InvoiceNotPayable", {
  direction: DirectionSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  transactionId: TransactionIdSchema,
}) {}
