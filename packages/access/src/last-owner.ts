import { Schema } from "effect";

import { MemberIdSchema, ProfileIdSchema } from "./model.js";

export class LastOwner extends Schema.TaggedError<
  LastOwner,
  { readonly brand: unique symbol }
>()("LastOwner", {
  memberId: MemberIdSchema,
  profileId: ProfileIdSchema,
}) {}
