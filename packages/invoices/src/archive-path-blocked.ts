import { Schema } from "effect";

import { DocumentIdSchema, ProfileIdSchema } from "./model.js";

export class ArchivePathBlocked extends Schema.TaggedError<
  ArchivePathBlocked,
  { readonly brand: unique symbol }
>()("ArchivePathBlocked", {
  documentId: DocumentIdSchema,
  entry: Schema.String,
  message: Schema.String,
  path: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
