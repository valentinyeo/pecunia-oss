import { Schema } from "effect";

export class WorkerRuntimeUnavailable extends Schema.TaggedError<
  WorkerRuntimeUnavailable,
  { readonly brand: unique symbol }
>()("WorkerRuntimeUnavailable", {
  cause: Schema.Defect(),
}) {}
