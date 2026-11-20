import { Schema } from "effect";

export class InvoiceStoreError extends Schema.TaggedError<
  InvoiceStoreError,
  { readonly brand: unique symbol }
>()("InvoiceStoreError", {
  message: Schema.String,
  operation: Schema.Literals([
    "document",
    "documents",
    "payment",
    "payments",
    "places",
    "saveDocument",
    "savePlace",
  ]),
  repair: Schema.String,
}) {}
