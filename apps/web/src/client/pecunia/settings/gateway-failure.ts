import { Schema } from "effect";

export class SettingsGatewayFailure extends Schema.TaggedError<
  SettingsGatewayFailure,
  { readonly brand: unique symbol }
>()("SettingsGatewayFailure", {
  cause: Schema.Defect(),
  message: Schema.NonEmptyString,
}) {}
