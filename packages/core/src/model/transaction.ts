import { Option, Schema } from "effect";

import type { Exact } from "./codec.js";
import { AmountsSchema, sourceAmount } from "./money.js";
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

export type Direction = Exact<typeof DirectionSchema.Type>;

export const CategorizationSchema = Schema.Union([
  Schema.TaggedStruct("Applied", {
    at: TimestampSchema,
    categoryId: CategoryIdSchema,
    ruleId: RuleIdSchema,
  }),
  Schema.TaggedStruct("Confirmed", {
    at: TimestampSchema,
    categoryId: CategoryIdSchema,
  }),
  Schema.TaggedStruct("None", {}),
  Schema.TaggedStruct("Suggested", {
    at: TimestampSchema,
    categoryId: CategoryIdSchema,
    model: Schema.NonEmptyString,
  }),
]).pipe(Schema.toTaggedUnion("_tag"));

export type Categorization = Exact<typeof CategorizationSchema.Type>;

export const ClassificationSchema = Schema.Union([
  Schema.TaggedStruct("Excluded", { ruleId: RuleIdSchema }),
  Schema.TaggedStruct("Income", {
    clientPayeeId: PayeeIdSchema,
    ruleId: RuleIdSchema,
  }),
  Schema.TaggedStruct("InternalTransfer", { ruleId: RuleIdSchema }),
  Schema.TaggedStruct("None", {}),
  Schema.TaggedStruct("Refund", {
    ofPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
    ruleId: RuleIdSchema,
  }),
  Schema.TaggedStruct("SelfTransfer", {
    counterpartProfileId: Schema.OptionFromNullishOr(ProfileIdSchema),
    ruleId: RuleIdSchema,
  }),
  Schema.TaggedStruct("TaxPayment", {
    obligationKind: Schema.NonEmptyString,
    ruleId: RuleIdSchema,
  }),
]).pipe(Schema.toTaggedUnion("_tag"));

export type Classification = Exact<typeof ClassificationSchema.Type>;

interface FeeBearingAmounts {
  readonly amounts: typeof AmountsSchema.Type;
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

export type Transaction = Exact<typeof TransactionSchema.Type>;
