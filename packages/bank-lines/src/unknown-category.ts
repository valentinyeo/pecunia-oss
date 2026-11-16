import { Schema } from "effect";

import { CategoryIdSchema, ProfileIdSchema } from "./model.js";

export class UnknownCategory extends Schema.TaggedError<
  UnknownCategory,
  { readonly brand: unique symbol }
>()("UnknownCategory", {
  categoryId: CategoryIdSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
