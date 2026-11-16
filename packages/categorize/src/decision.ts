import { Schema } from "effect";

import { DisplayNameSchema } from "./amount.js";
import {
  CategoryIdSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  RuleIdSchema,
} from "./ids.js";

export const CategorizationSchema = Schema.TaggedUnion({
  Applied: { categoryId: CategoryIdSchema, ruleId: RuleIdSchema },
  None: {},
});

export type Categorization = typeof CategorizationSchema.Type;

export const ClassificationSchema = Schema.TaggedUnion({
  Excluded: { ruleId: RuleIdSchema },
  Income: { clientPayeeId: PayeeIdSchema, ruleId: RuleIdSchema },
  InternalTransfer: { ruleId: RuleIdSchema },
  None: {},
  Refund: { ruleId: RuleIdSchema },
  SelfTransfer: {
    counterpartProfileId: Schema.NullOr(ProfileIdSchema),
    ruleId: RuleIdSchema,
  },
  TaxPayment: {
    obligationKind: DisplayNameSchema,
    ruleId: RuleIdSchema,
  },
});

export type Classification = typeof ClassificationSchema.Type;

export const LineDecisionSchema = Schema.Struct({
  categorization: CategorizationSchema,
  classification: ClassificationSchema,
  payeeId: Schema.NullOr(PayeeIdSchema),
});

export type LineDecision = typeof LineDecisionSchema.Type;
