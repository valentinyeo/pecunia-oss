import { Schema } from "effect";

export class InvestmentsUnavailable extends Schema.TaggedError<
  InvestmentsUnavailable,
  { readonly brand: unique symbol }
>()("InvestmentsUnavailable", {
  cause: Schema.Defect(),
  message: Schema.String,
  operation: Schema.String,
  repair: Schema.String,
}) {}
