import { Option, Schema } from "effect";

import { DisplayNameSchema, MinorUnitsSchema } from "./amount.js";
import { exclusiveUnion, siblingExclusions } from "./exclusive-union.js";
import type { UnionMembers } from "./exclusive-union.js";
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

const ruleBody = {
  direction: RuleDirectionSchema,
  enabled: Schema.Boolean,
  matchField: MatchFieldSchema,
  matchType: MatchTypeSchema,
  maxAmount: Schema.OptionFromNullishOr(MinorUnitsSchema),
  minAmount: Schema.OptionFromNullishOr(MinorUnitsSchema),
  pattern: DisplayNameSchema,
  priority: Schema.Int,
} as const;

const ruleFields = {
  ...ruleBody,
  id: RuleIdSchema,
  profileId: ProfileIdSchema,
} as const;

const ruleTargets = {
  categorize: { categoryId: CategoryIdSchema },
  exclude: {},
  income_client: { clientPayeeId: PayeeIdSchema },
  internal_transfer: {},
  refund: {},
  self_transfer: {
    counterpartProfileId: Schema.OptionFromNullishOr(ProfileIdSchema),
  },
  tax_payment: { obligationKind: DisplayNameSchema },
} as const satisfies UnionMembers;

const ruleExclusions = {
  categorize: siblingExclusions(
    ruleFields,
    ruleTargets,
    ruleTargets.categorize
  ),
  exclude: siblingExclusions(ruleFields, ruleTargets, ruleTargets.exclude),
  income_client: siblingExclusions(
    ruleFields,
    ruleTargets,
    ruleTargets.income_client
  ),
  internal_transfer: siblingExclusions(
    ruleFields,
    ruleTargets,
    ruleTargets.internal_transfer
  ),
  refund: siblingExclusions(ruleFields, ruleTargets, ruleTargets.refund),
  self_transfer: siblingExclusions(
    ruleFields,
    ruleTargets,
    ruleTargets.self_transfer
  ),
  tax_payment: siblingExclusions(
    ruleFields,
    ruleTargets,
    ruleTargets.tax_payment
  ),
} as const;

const RuleUnion = exclusiveUnion(
  "RuleSchema",
  "kind",
  ruleFields,
  ruleTargets,
  [
    Schema.Struct({
      ...ruleFields,
      ...ruleExclusions.categorize,
      ...ruleTargets.categorize,
      kind: Schema.Literal("categorize"),
    }),
    Schema.Struct({
      ...ruleFields,
      ...ruleExclusions.income_client,
      ...ruleTargets.income_client,
      kind: Schema.Literal("income_client"),
    }),
    Schema.Struct({
      ...ruleFields,
      ...ruleExclusions.self_transfer,
      ...ruleTargets.self_transfer,
      kind: Schema.Literal("self_transfer"),
    }),
    Schema.Struct({
      ...ruleFields,
      ...ruleExclusions.tax_payment,
      ...ruleTargets.tax_payment,
      kind: Schema.Literal("tax_payment"),
    }),
    Schema.Struct({
      ...ruleFields,
      ...ruleExclusions.exclude,
      ...ruleTargets.exclude,
      kind: Schema.Literal("exclude"),
    }),
    Schema.Struct({
      ...ruleFields,
      ...ruleExclusions.internal_transfer,
      ...ruleTargets.internal_transfer,
      kind: Schema.Literal("internal_transfer"),
    }),
    Schema.Struct({
      ...ruleFields,
      ...ruleExclusions.refund,
      ...ruleTargets.refund,
      kind: Schema.Literal("refund"),
    }),
  ]
);

const amountBoundsAreLegal = Schema.makeFilter<typeof RuleUnion.Type>(
  (rule) => {
    const min = Option.getOrUndefined(rule.minAmount) ?? 0;
    const max = Option.getOrUndefined(rule.maxAmount);

    return min >= 0 && (max === undefined || (max >= 0 && min <= max));
  },
  { expected: "non-negative amount bounds in order" }
);

const digitsRuleCanMatch = Schema.makeFilter<typeof RuleUnion.Type>(
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

export const RuleDraftSchema = exclusiveUnion(
  "RuleDraftSchema",
  "kind",
  ruleBody,
  ruleTargets,
  [
    Schema.Struct({
      ...ruleBody,
      ...ruleExclusions.categorize,
      ...ruleTargets.categorize,
      kind: Schema.Literal("categorize"),
    }),
    Schema.Struct({
      ...ruleBody,
      ...ruleExclusions.income_client,
      ...ruleTargets.income_client,
      kind: Schema.Literal("income_client"),
    }),
    Schema.Struct({
      ...ruleBody,
      ...ruleExclusions.self_transfer,
      ...ruleTargets.self_transfer,
      kind: Schema.Literal("self_transfer"),
    }),
    Schema.Struct({
      ...ruleBody,
      ...ruleExclusions.tax_payment,
      ...ruleTargets.tax_payment,
      kind: Schema.Literal("tax_payment"),
    }),
    Schema.Struct({
      ...ruleBody,
      ...ruleExclusions.exclude,
      ...ruleTargets.exclude,
      kind: Schema.Literal("exclude"),
    }),
    Schema.Struct({
      ...ruleBody,
      ...ruleExclusions.internal_transfer,
      ...ruleTargets.internal_transfer,
      kind: Schema.Literal("internal_transfer"),
    }),
    Schema.Struct({
      ...ruleBody,
      ...ruleExclusions.refund,
      ...ruleTargets.refund,
      kind: Schema.Literal("refund"),
    }),
  ]
);

export type RuleDraft = typeof RuleDraftSchema.Type;
