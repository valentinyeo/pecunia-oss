import { Option, Schema } from "effect";

import { DisplayNameSchema, MinorUnitsSchema } from "./amount.js";
import {
  CategoryIdSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  RuleIdSchema,
} from "./ids.js";

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
  direction: RuleDirectionSchema,
  enabled: Schema.Boolean,
  id: RuleIdSchema,
  matchField: MatchFieldSchema,
  matchType: MatchTypeSchema,
  maxAmount: Schema.OptionFromNullishOr(MinorUnitsSchema),
  minAmount: Schema.OptionFromNullishOr(MinorUnitsSchema),
  pattern: DisplayNameSchema,
  priority: Schema.Int,
  profileId: ProfileIdSchema,
} as const;

const noTarget = {
  categoryId: Schema.optionalKey(Schema.Never),
  clientPayeeId: Schema.optionalKey(Schema.Never),
  counterpartProfileId: Schema.optionalKey(Schema.Never),
  obligationKind: Schema.optionalKey(Schema.Never),
} as const;

const RuleUnion = Schema.Union([
  Schema.Struct({
    ...ruleFields,
    ...noTarget,
    categoryId: CategoryIdSchema,
    kind: Schema.Literal("categorize"),
  }),
  Schema.Struct({
    ...ruleFields,
    ...noTarget,
    clientPayeeId: PayeeIdSchema,
    kind: Schema.Literal("income_client"),
  }),
  Schema.Struct({
    ...ruleFields,
    ...noTarget,
    counterpartProfileId: Schema.OptionFromNullishOr(ProfileIdSchema),
    kind: Schema.Literal("self_transfer"),
  }),
  Schema.Struct({
    ...ruleFields,
    ...noTarget,
    kind: Schema.Literal("tax_payment"),
    obligationKind: DisplayNameSchema,
  }),
  Schema.Struct({
    ...ruleFields,
    ...noTarget,
    kind: Schema.Literal("exclude"),
  }),
  Schema.Struct({
    ...ruleFields,
    ...noTarget,
    kind: Schema.Literal("internal_transfer"),
  }),
  Schema.Struct({
    ...ruleFields,
    ...noTarget,
    kind: Schema.Literal("refund"),
  }),
]);

type RuleUnionType = typeof RuleUnion.Type;

const amountBoundsAreLegal = Schema.makeFilter<RuleUnionType>(
  (rule) => {
    const min = Option.getOrUndefined(rule.minAmount) ?? 0;
    const max = Option.getOrUndefined(rule.maxAmount);

    return min >= 0 && (max === undefined || (max >= 0 && min <= max));
  },
  { expected: "non-negative amount bounds in order" }
);

const digitsRuleCanMatch = Schema.makeFilter<RuleUnionType>(
  (rule) => rule.matchType !== "digits_only" || /\d/u.test(rule.pattern),
  { expected: "a digits_only pattern that holds a digit" }
);

export const RuleSchema = RuleUnion.check(
  amountBoundsAreLegal,
  digitsRuleCanMatch
);

export type Rule = typeof RuleSchema.Type;

export type RuleKind = Rule["kind"];

export type CategorizeRule = Extract<Rule, { readonly kind: "categorize" }>;

export type ClassificationRule = Exclude<Rule, CategorizeRule>;

export const isCategorizeRule = (rule: Rule): rule is CategorizeRule =>
  rule.kind === "categorize";

export const isClassificationRule = (rule: Rule): rule is ClassificationRule =>
  rule.kind !== "categorize";

type DistributiveOmit<Value, Key extends PropertyKey> = Value extends unknown
  ? Omit<Value, Key>
  : never;

export type RuleDraft = DistributiveOmit<Rule, "id" | "profileId">;
