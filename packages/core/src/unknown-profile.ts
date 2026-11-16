import { Schema } from "effect";

export class UnknownProfile extends Schema.TaggedError<
  UnknownProfile,
  { readonly brand: unique symbol }
>()("UnknownProfile", {
  profileId: Schema.String,
}) {}
