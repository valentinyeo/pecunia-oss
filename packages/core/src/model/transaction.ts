import { Option, Schema } from "effect";

import { AmountsSchema, sourceAmount } from "./money.js";
import type { Amounts } from "./money.js";
import type { Money } from "./primitives.js";
import {
  CategoryIdSchema,
  DateOnlySchema,
  MoneySchema,
  PayeeIdSchema,
  ProfileIdSchema,
  ProviderAccountIdSchema,
  RuleIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "./primitives.js";

export const DirectionSchema = Schema.Literals(["in", "neutral", "out"]);

export type Direction = typeof DirectionSchema.Type;

const noCategorizationDetail = {
  at: Schema.optionalKey(Schema.Never),
  categoryId: Schema.optionalKey(Schema.Never),
  model: Schema.optionalKey(Schema.Never),
  ruleId: Schema.optionalKey(Schema.Never),
} as const;

export const CategorizationSchema = Schema.TaggedUnion({
  Applied: {
    ...noCategorizationDetail,
    at: TimestampSchema,
    categoryId: CategoryIdSchema,
    ruleId: RuleIdSchema,
  },
  Confirmed: {
    ...noCategorizationDetail,
    at: TimestampSchema,
    categoryId: CategoryIdSchema,
  },
  None: { ...noCategorizationDetail },
  Suggested: {
    ...noCategorizationDetail,
    at: TimestampSchema,
    categoryId: CategoryIdSchema,
    model: Schema.NonEmptyString,
  },
});

export type Categorization = typeof CategorizationSchema.Type;

const noClassificationTarget = {
  clientPayeeId: Schema.optionalKey(Schema.Never),
  counterpartProfileId: Schema.optionalKey(Schema.Never),
  obligationKind: Schema.optionalKey(Schema.Never),
  ofPayeeId: Schema.optionalKey(Schema.Never),
} as const;

const classified = { ...noClassificationTarget, ruleId: RuleIdSchema } as const;

export const ClassificationSchema = Schema.TaggedUnion({
  Excluded: { ...classified },
  Income: {
    ...noClassificationTarget,
    clientPayeeId: PayeeIdSchema,
    ruleId: RuleIdSchema,
  },
  InternalTransfer: { ...classified },
  None: { ...noClassificationTarget, ruleId: Schema.optionalKey(Schema.Never) },
  Refund: {
    ...noClassificationTarget,
    ofPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
    ruleId: RuleIdSchema,
  },
  SelfTransfer: {
    ...noClassificationTarget,
    counterpartProfileId: Schema.OptionFromNullishOr(ProfileIdSchema),
    ruleId: RuleIdSchema,
  },
  TaxPayment: {
    ...noClassificationTarget,
    obligationKind: Schema.NonEmptyString,
    ruleId: RuleIdSchema,
  },
});

export type Classification = typeof ClassificationSchema.Type;

interface FeeBearingAmounts {
  readonly amounts: Amounts;
  readonly fee: Option.Option<Money>;
}

const feeSharesSourceCurrency = Schema.makeFilter<FeeBearingAmounts>(
  (transaction) =>
    Option.isNone(transaction.fee) ||
    transaction.fee.value.currency ===
      sourceAmount(transaction.amounts).currency,
  { expected: "a fee in the source currency" }
);

export const TransactionSchema = Schema.Struct({
  amounts: AmountsSchema,
  categorization: CategorizationSchema,
  classification: ClassificationSchema,
  createdAt: TimestampSchema,
  direction: DirectionSchema,
  externalId: Schema.NonEmptyString,
  fee: Schema.OptionFromNullishOr(MoneySchema),
  id: TransactionIdSchema,
  note: Schema.String,
  occurredAt: TimestampSchema,
  payeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
  profileId: ProfileIdSchema,
  providerAccountId: ProviderAccountIdSchema,
  raw: Schema.Struct({
    description: Schema.String,
    merchant: Schema.String,
    reference: Schema.String,
  }),
  status: Schema.Literals(["posted", "pending", "reversed"]),
  valueDate: DateOnlySchema,
}).check(feeSharesSourceCurrency);

export type Transaction = typeof TransactionSchema.Type;
