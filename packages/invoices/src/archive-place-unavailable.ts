import { Schema } from "effect";

import {
  ArchivePlaceIdSchema,
  ArchiveProviderSchema,
  ProfileIdSchema,
} from "./model.js";

export class ArchivePlaceUnavailable extends Schema.TaggedError<
  ArchivePlaceUnavailable,
  { readonly brand: unique symbol }
>()("ArchivePlaceUnavailable", {
  message: Schema.String,
  placeId: ArchivePlaceIdSchema,
  profileId: ProfileIdSchema,
  provider: ArchiveProviderSchema,
  repair: Schema.String,
}) {}
