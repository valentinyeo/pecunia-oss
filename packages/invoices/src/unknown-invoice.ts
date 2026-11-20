import { Schema } from "effect";

import { DocumentIdSchema, ProfileIdSchema } from "./model.js";

export class UnknownInvoice extends Schema.TaggedError<
  UnknownInvoice,
  { readonly brand: unique symbol }
>()("UnknownInvoice", {
  documentId: DocumentIdSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
