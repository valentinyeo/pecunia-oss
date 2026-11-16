import { Schema } from "effect";

import { CategorizationOperationSchema } from "./categorization-model.js";

export class InvalidCategorizationInput extends Schema.TaggedError<
  InvalidCategorizationInput,
  { readonly brand: unique symbol }
>()("InvalidCategorizationInput", {
  cause: Schema.Defect(),
  operation: CategorizationOperationSchema,
}) {}
