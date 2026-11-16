import { ProfileIdSchema, RuleIdSchema } from "@pecunia/categorize";
import { Schema } from "effect";

export class RuleNotFound extends Schema.TaggedError<
  RuleNotFound,
  { readonly brand: unique symbol }
>()("RuleNotFound", {
  profileId: ProfileIdSchema,
  ruleId: RuleIdSchema,
}) {}
