import { Schema } from "effect";

import { ReportIdSchema } from "./model.js";

export class ReportNotFound extends Schema.TaggedError<
  ReportNotFound,
  { readonly brand: unique symbol }
>()("ReportNotFound", {
  id: ReportIdSchema,
}) {}
