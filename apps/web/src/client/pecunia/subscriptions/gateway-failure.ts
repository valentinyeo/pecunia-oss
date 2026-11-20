import { Schema } from "effect";

export class SubscriptionsGatewayFailure extends Schema.TaggedError<
  SubscriptionsGatewayFailure,
  { readonly brand: unique symbol }
>()("SubscriptionsGatewayFailure", {
  cause: Schema.Defect(),
  message: Schema.NonEmptyString,
}) {}
