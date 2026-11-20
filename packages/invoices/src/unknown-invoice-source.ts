import { Schema } from "effect";

import { InvoiceSourceIdSchema, ProfileIdSchema } from "./model.js";

export class UnknownInvoiceSource extends Schema.TaggedError<
  UnknownInvoiceSource,
  { readonly brand: unique symbol }
>()("UnknownInvoiceSource", {
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  sourceId: InvoiceSourceIdSchema,
}) {}
