import { Schema } from "effect";

import { MemberIdSchema } from "./model.js";

export class MemberNotFound extends Schema.TaggedError<
  MemberNotFound,
  { readonly brand: unique symbol }
>()("MemberNotFound", {
  memberId: MemberIdSchema,
}) {}
