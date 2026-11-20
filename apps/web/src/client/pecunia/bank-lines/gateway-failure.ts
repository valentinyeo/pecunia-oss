import { Schema } from "effect";

export class BankLinesGatewayFailure extends Schema.TaggedError<
  BankLinesGatewayFailure,
  { readonly brand: unique symbol }
>()("BankLinesGatewayFailure", {
  cause: Schema.Defect(),
  message: Schema.NonEmptyString,
}) {}
