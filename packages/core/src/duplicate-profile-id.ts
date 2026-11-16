import { Schema } from "effect";

export class DuplicateProfileId extends Schema.TaggedError<
  DuplicateProfileId,
  { readonly brand: unique symbol }
>()("DuplicateProfileId", {
  profileId: Schema.String,
}) {}
