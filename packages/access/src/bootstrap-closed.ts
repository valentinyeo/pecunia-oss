import { Schema } from "effect";

import { ProfileIdSchema } from "./model.js";

export class BootstrapClosed extends Schema.TaggedError<
  BootstrapClosed,
  { readonly brand: unique symbol }
>()("BootstrapClosed", {
  message: Schema.String,
  profileId: ProfileIdSchema,
}) {}
