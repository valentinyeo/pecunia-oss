import { Schema } from "effect";

import { PayeeIdSchema, ProfileIdSchema } from "./model.js";

export class NoRepeatPaymentFound extends Schema.TaggedError<
  NoRepeatPaymentFound,
  { readonly brand: unique symbol }
>()("NoRepeatPaymentFound", {
  message: Schema.String,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
