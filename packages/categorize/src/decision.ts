import { Schema } from "effect";

import { DisplayNameSchema } from "./amount.js";
import {
  exclusiveStructUnion,
  exclusiveTaggedUnion,
  siblingExclusions,
} from "./exclusive-union.js";
import type { UnionMembers } from "./exclusive-union.js";
import {
  CategoryIdSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  RuleIdSchema,
} from "./ids.js";

const categorizationTargets = {
  Applied: { categoryId: CategoryIdSchema, ruleId: RuleIdSchema },
  None: {},
} as const satisfies UnionMembers;

const categorizationCases = {
  Applied: {
    ...siblingExclusions(
      {},
      categorizationTargets,
      categorizationTargets.Applied
    ),
    ...categorizationTargets.Applied,
  },
  None: {
    ...siblingExclusions({}, categorizationTargets, categorizationTargets.None),
    ...categorizationTargets.None,
  },
} as const;

export const CategorizationSchema = exclusiveTaggedUnion(
  "CategorizationSchema",
  {},
  categorizationTargets,
  categorizationCases
);

export type Categorization = typeof CategorizationSchema.Type;

const classificationRule = { ruleId: RuleIdSchema } as const;

const classificationTargets = {
  Excluded: { ...classificationRule },
  Income: { ...classificationRule, clientPayeeId: PayeeIdSchema },
  InternalTransfer: { ...classificationRule },
  None: {},
  Refund: { ...classificationRule },
  SelfTransfer: {
    ...classificationRule,
    counterpartProfileId: Schema.NullOr(ProfileIdSchema),
  },
  TaxPayment: { ...classificationRule, obligationKind: DisplayNameSchema },
} as const satisfies UnionMembers;

const classificationCases = {
  Excluded: {
    ...siblingExclusions(
      {},
      classificationTargets,
      classificationTargets.Excluded
    ),
    ...classificationTargets.Excluded,
  },
  Income: {
    ...siblingExclusions(
      {},
      classificationTargets,
      classificationTargets.Income
    ),
    ...classificationTargets.Income,
  },
  InternalTransfer: {
    ...siblingExclusions(
      {},
      classificationTargets,
      classificationTargets.InternalTransfer
    ),
    ...classificationTargets.InternalTransfer,
  },
  None: {
    ...siblingExclusions({}, classificationTargets, classificationTargets.None),
    ...classificationTargets.None,
  },
  Refund: {
    ...siblingExclusions(
      {},
      classificationTargets,
      classificationTargets.Refund
    ),
    ...classificationTargets.Refund,
  },
  SelfTransfer: {
    ...siblingExclusions(
      {},
      classificationTargets,
      classificationTargets.SelfTransfer
    ),
    ...classificationTargets.SelfTransfer,
  },
  TaxPayment: {
    ...siblingExclusions(
      {},
      classificationTargets,
      classificationTargets.TaxPayment
    ),
    ...classificationTargets.TaxPayment,
  },
} as const;

export const ClassificationSchema = exclusiveTaggedUnion(
  "ClassificationSchema",
  {},
  classificationTargets,
  classificationCases
);

export type Classification = typeof ClassificationSchema.Type;

const classificationWithoutExcluded = exclusiveTaggedUnion(
  "ClassificationSchema.Excluding",
  {},
  classificationTargets,
  {
    Income: classificationCases.Income,
    InternalTransfer: classificationCases.InternalTransfer,
    None: classificationCases.None,
    Refund: classificationCases.Refund,
    SelfTransfer: classificationCases.SelfTransfer,
    TaxPayment: classificationCases.TaxPayment,
  }
);

const excludedClassification = exclusiveTaggedUnion(
  "ClassificationSchema.Excluded",
  {},
  classificationTargets,
  { Excluded: classificationCases.Excluded }
);

const noCategorization = exclusiveTaggedUnion(
  "CategorizationSchema.None",
  {},
  categorizationTargets,
  { None: categorizationCases.None }
);

const decisionFields = { payeeId: Schema.NullOr(PayeeIdSchema) } as const;

export const LineDecisionSchema = exclusiveStructUnion([
  Schema.Struct({
    ...decisionFields,
    categorization: CategorizationSchema,
    classification: classificationWithoutExcluded,
  }),
  Schema.Struct({
    ...decisionFields,
    categorization: noCategorization,
    classification: excludedClassification,
  }),
]);

export type LineDecision = typeof LineDecisionSchema.Type;
