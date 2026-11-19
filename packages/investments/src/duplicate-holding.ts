import { Schema } from "effect";

import {
  HoldingSymbolSchema,
  PlatformIdSchema,
  ProfileIdSchema,
} from "./model.js";

export class DuplicateHolding extends Schema.TaggedError<
  DuplicateHolding,
  { readonly brand: unique symbol }
>()("DuplicateHolding", {
  message: Schema.String,
  platformId: PlatformIdSchema,
  profileId: ProfileIdSchema,
  repair: Schema.String,
  symbol: HoldingSymbolSchema,
}) {}
