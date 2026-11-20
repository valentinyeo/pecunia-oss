import { Schema } from "effect";

import {
  DocumentIdSchema,
  ProfileIdSchema,
  TransactionIdSchema,
} from "./model.js";

export class InvoiceAlreadyAttached extends Schema.TaggedError<
  InvoiceAlreadyAttached,
  { readonly brand: unique symbol }
>()("InvoiceAlreadyAttached", {
  attachedTo: TransactionIdSchema,
  documentId: DocumentIdSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  transactionId: TransactionIdSchema,
}) {}
