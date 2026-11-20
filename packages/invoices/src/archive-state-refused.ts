import { Schema } from "effect";

import {
  ArchiveStateTagSchema,
  DocumentIdSchema,
  ProfileIdSchema,
} from "./model.js";

export class ArchiveStateRefused extends Schema.TaggedError<
  ArchiveStateRefused,
  { readonly brand: unique symbol }
>()("ArchiveStateRefused", {
  documentId: DocumentIdSchema,
  from: ArchiveStateTagSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  to: ArchiveStateTagSchema,
}) {}
