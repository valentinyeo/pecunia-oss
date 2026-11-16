import { Schema } from "effect";

export class ProfileNameTaken extends Schema.TaggedError<
  ProfileNameTaken,
  { readonly brand: unique symbol }
>()("ProfileNameTaken", {
  profileName: Schema.String,
}) {}
