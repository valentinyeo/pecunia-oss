import { Schema } from "effect";

export const ReportStoreOperationSchema = Schema.Literals([
  "delete",
  "get",
  "list",
  "save",
]);

export type ReportStoreOperation = typeof ReportStoreOperationSchema.Type;

export class ReportStoreError extends Schema.TaggedError<
  ReportStoreError,
  { readonly brand: unique symbol }
>()("ReportStoreError", {
  cause: Schema.Defect(),
  operation: ReportStoreOperationSchema,
}) {}
