import { Schema } from "effect";

import { ProfileIdSchema } from "./model.js";

export class LegacyFilesRefused extends Schema.TaggedError<
  LegacyFilesRefused,
  { readonly brand: unique symbol }
>()("LegacyFilesRefused", {
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
