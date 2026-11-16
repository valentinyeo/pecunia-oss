import { Schema } from "effect";

export class ImportAccountNotFound extends Schema.TaggedError<
  ImportAccountNotFound,
  { readonly brand: unique symbol }
>()("ImportAccountNotFound", {
  accountId: Schema.String,
  profileId: Schema.String,
}) {}
