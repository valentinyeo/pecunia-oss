import { Schema } from "effect";

export class InvalidInvoiceRequest extends Schema.TaggedError<
  InvalidInvoiceRequest,
  { readonly brand: unique symbol }
>()("InvalidInvoiceRequest", {
  capability: Schema.String,
  field: Schema.String,
  message: Schema.String,
  repair: Schema.String,
}) {}
