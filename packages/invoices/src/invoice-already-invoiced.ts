import { Schema } from "effect";

import {
  DocumentIdSchema,
  ProfileIdSchema,
  TransactionIdSchema,
} from "./model.js";

export class InvoiceAlreadyInvoiced extends Schema.TaggedError<
  InvoiceAlreadyInvoiced,
  { readonly brand: unique symbol }
>()("InvoiceAlreadyInvoiced", {
  documentId: DocumentIdSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  transactionId: TransactionIdSchema,
}) {}
