import { Schema } from "effect";

import { HoldingIdSchema, ProfileIdSchema } from "./model.js";

export class UnknownHolding extends Schema.TaggedError<
  UnknownHolding,
  { readonly brand: unique symbol }
>()("UnknownHolding", {
  holdingId: HoldingIdSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
