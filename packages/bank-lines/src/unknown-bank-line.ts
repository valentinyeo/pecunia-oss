import { Schema } from "effect";

import { BankLineIdSchema, ProfileIdSchema } from "./model.js";

export class UnknownBankLine extends Schema.TaggedError<
  UnknownBankLine,
  { readonly brand: unique symbol }
>()("UnknownBankLine", {
  lineId: BankLineIdSchema,
  message: Schema.String,
  profileId: ProfileIdSchema,
  repair: Schema.String,
}) {}
