import { Schema } from "effect";

import { ProfileIdSchema } from "./model.js";

export class MismatchedProfile extends Schema.TaggedError<
  MismatchedProfile,
  { readonly brand: unique symbol }
>()("MismatchedProfile", {
  holdingProfileId: ProfileIdSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
