import { Schema } from "effect";

import { PayeeIdSchema, ProfileIdSchema } from "./model.js";

export class UnknownVendorPayee extends Schema.TaggedError<
  UnknownVendorPayee,
  { readonly brand: unique symbol }
>()("UnknownVendorPayee", {
  message: Schema.String,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
