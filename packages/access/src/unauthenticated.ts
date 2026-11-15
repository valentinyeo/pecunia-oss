import { Schema } from "effect";

export const UnauthenticatedReasonSchema = Schema.Literals([
  "algorithm",
  "audience",
  "claims",
  "expired",
  "issuer",
  "key",
  "malformed",
  "notYetValid",
  "signature",
]);

export type UnauthenticatedReason = typeof UnauthenticatedReasonSchema.Type;

export class Unauthenticated extends Schema.TaggedError<
  Unauthenticated,
  { readonly brand: unique symbol }
>()("Unauthenticated", {
  message: Schema.String,
  reason: UnauthenticatedReasonSchema,
}) {}
