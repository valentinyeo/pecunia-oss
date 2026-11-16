import { Schema } from "effect";

export const ForbiddenReasonSchema = Schema.Literals([
  "notMember",
  "notOwner",
  "serviceToken",
]);

export type ForbiddenReason = typeof ForbiddenReasonSchema.Type;

export class Forbidden extends Schema.TaggedError<
  Forbidden,
  { readonly brand: unique symbol }
>()("Forbidden", {
  message: Schema.String,
  reason: ForbiddenReasonSchema,
}) {}
