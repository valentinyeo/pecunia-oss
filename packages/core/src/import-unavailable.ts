import { Schema } from "effect";

export class ImportUnavailable extends Schema.TaggedError<
  ImportUnavailable,
  { readonly brand: unique symbol }
>()("ImportUnavailable", {
  cause: Schema.Defect(),
  operation: Schema.Literals(["listTargets", "record"]),
}) {}
