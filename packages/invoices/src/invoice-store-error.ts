import { Schema } from "effect";

export class InvoiceStoreError extends Schema.TaggedError<
  InvoiceStoreError,
  { readonly brand: unique symbol }
>()("InvoiceStoreError", {
  message: Schema.String,
  operation: Schema.Literals([
    "createDocument",
    "deleteDocument",
    "deleteSource",
    "document",
    "documents",
    "exceptions",
    "payment",
    "payments",
    "places",
    "saveDocument",
    "saveException",
    "savePlace",
    "saveSource",
    "sources",
  ]),
  repair: Schema.String,
}) {}
