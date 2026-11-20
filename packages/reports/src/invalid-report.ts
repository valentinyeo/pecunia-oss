import { Schema } from "effect";

export const ReportFieldSchema = Schema.Literals(["body", "id", "title"]);

export type ReportField = typeof ReportFieldSchema.Type;

export class InvalidReport extends Schema.TaggedError<
  InvalidReport,
  { readonly brand: unique symbol }
>()("InvalidReport", {
  field: ReportFieldSchema,
  message: Schema.String,
}) {}
