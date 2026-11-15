import { Option, Schema } from "effect";

import {
  CategoryIdSchema,
  MinorUnitsSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  RuleIdSchema,
  TimestampSchema,
} from "./primitives.js";

export const MatchFieldSchema = Schema.Literals([
  "description",
  "merchant",
  "reference",
]);

export type MatchField = typeof MatchFieldSchema.Type;

export const MatchTypeSchema = Schema.Literals([
  "contains",
  "digits_only",
  "exact",
  "prefix",
]);

export type MatchType = typeof MatchTypeSchema.Type;

export const RuleDirectionSchema = Schema.Literals(["any", "in", "out"]);

export type RuleDirection = typeof RuleDirectionSchema.Type;

const ruleFields = {
  createdAt: TimestampSchema,
  direction: RuleDirectionSchema,
  enabled: Schema.Boolean,
  id: RuleIdSchema,
  matchField: MatchFieldSchema,
  matchType: MatchTypeSchema,
  maxAmount: Schema.OptionFromNullishOr(MinorUnitsSchema),
  minAmount: Schema.OptionFromNullishOr(MinorUnitsSchema),
  pattern: Schema.NonEmptyString,
  priority: Schema.Int,
  profileId: ProfileIdSchema,
} as const;

const RuleUnion = Schema.Union([
  Schema.Struct({
    ...ruleFields,
    categoryId: CategoryIdSchema,
    kind: Schema.Literal("categorize"),
  }),
  Schema.Struct({
    ...ruleFields,
    clientPayeeId: PayeeIdSchema,
    kind: Schema.Literal("income_client"),
  }),
  Schema.Struct({
    ...ruleFields,
    counterpartProfileId: Schema.OptionFromNullishOr(ProfileIdSchema),
    kind: Schema.Literal("self_transfer"),
  }),
  Schema.Struct({
    ...ruleFields,
    kind: Schema.Literal("tax_payment"),
    obligationKind: Schema.NonEmptyString,
  }),
  Schema.Struct({ ...ruleFields, kind: Schema.Literal("refund") }),
  Schema.Struct({ ...ruleFields, kind: Schema.Literal("internal_transfer") }),
  Schema.Struct({ ...ruleFields, kind: Schema.Literal("exclude") }),
]);

const boundsAreOrdered = Schema.makeFilter<typeof RuleUnion.Type>(
  (rule) =>
    Option.isNone(rule.minAmount) ||
    Option.isNone(rule.maxAmount) ||
    rule.minAmount.value <= rule.maxAmount.value,
  { expected: "minAmount at or below maxAmount" }
);

export const RuleSchema = RuleUnion.check(boundsAreOrdered);

export type Rule = typeof RuleSchema.Type;
