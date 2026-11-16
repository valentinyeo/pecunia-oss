import { Schema } from "effect";

export class DirectoryUnavailable extends Schema.TaggedError<
  DirectoryUnavailable,
  { readonly brand: unique symbol }
>()("DirectoryUnavailable", {
  cause: Schema.Defect(),
}) {}
