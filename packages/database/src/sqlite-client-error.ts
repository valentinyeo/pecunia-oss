import { Schema } from "effect";

export class SqliteClientError extends Schema.TaggedError<
  SqliteClientError,
  { readonly brand: unique symbol }
>()("SqliteClientError", {
  cause: Schema.Defect(),
  operation: Schema.Literals(["batch", "execute", "query"]),
  sql: Schema.String,
}) {}
