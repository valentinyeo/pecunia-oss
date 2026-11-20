import { Schema } from "effect";

import { ArchivePlaceIdSchema, ProfileIdSchema } from "./model.js";

export class UnknownArchivePlace extends Schema.TaggedError<
  UnknownArchivePlace,
  { readonly brand: unique symbol }
>()("UnknownArchivePlace", {
  message: Schema.String,
  placeId: ArchivePlaceIdSchema,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
