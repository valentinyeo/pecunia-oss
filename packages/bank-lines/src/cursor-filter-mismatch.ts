import { Schema } from "effect";

import { CursorFingerprintSchema } from "./model.js";

export class CursorFilterMismatch extends Schema.TaggedError<
  CursorFilterMismatch,
  { readonly brand: unique symbol }
>()("CursorFilterMismatch", {
  cursorFingerprint: CursorFingerprintSchema,
  filterFingerprint: CursorFingerprintSchema,
  message: Schema.String,
  repair: Schema.String,
}) {}
