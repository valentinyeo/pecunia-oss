import { Schema } from "effect";

import { PlatformIdSchema, ProfileIdSchema } from "./model.js";

export class UnknownPlatform extends Schema.TaggedError<
  UnknownPlatform,
  { readonly brand: unique symbol }
>()("UnknownPlatform", {
  message: Schema.String,
  platformId: PlatformIdSchema,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
