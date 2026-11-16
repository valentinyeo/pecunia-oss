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

export const CategorizationSchema = Schema.TaggedUnion({
  Applied: {
    at: TimestampSchema,
    categoryId: CategoryIdSchema,
    ruleId: RuleIdSchema,
  },
  Confirmed: { at: TimestampSchema, categoryId: CategoryIdSchema },
  None: {},
  Suggested: {
    at: TimestampSchema,
    categoryId: CategoryIdSchema,
    model: Schema.NonEmptyString,
  },
});

export type Categorization = typeof CategorizationSchema.Type;

export const ClassificationSchema = Schema.TaggedUnion({
  Excluded: { ruleId: RuleIdSchema },
  Income: { clientPayeeId: PayeeIdSchema, ruleId: RuleIdSchema },
  InternalTransfer: { ruleId: RuleIdSchema },
  None: {},
  Refund: {
    ofPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
    ruleId: RuleIdSchema,
  },
  SelfTransfer: {
    counterpartProfileId: Schema.OptionFromNullishOr(ProfileIdSchema),
    ruleId: RuleIdSchema,
  },
  TaxPayment: { obligationKind: Schema.NonEmptyString, ruleId: RuleIdSchema },
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
