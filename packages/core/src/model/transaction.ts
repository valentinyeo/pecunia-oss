import { Option, Predicate, Schema } from "effect";

import {
  BaseAmountSchema,
  CategoryIdSchema,
  DateOnlySchema,
  MoneySchema,
  PayeeIdSchema,
  ProfileIdSchema,
  ProviderAccountIdSchema,
  RateSchema,
  RuleIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "./primitives.js";
import type { BaseAmount, Money } from "./primitives.js";

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

export const ConversionSchema = Schema.TaggedUnion({
  Converted: { asOf: DateOnlySchema, rate: RateSchema },
  SameCurrency: {},
});

export type Conversion = typeof ConversionSchema.Type;

interface CurrencyLinkedAmounts {
  readonly base: BaseAmount;
  readonly conversion: Conversion;
  readonly fee: Option.Option<Money>;
  readonly source: Money;
}

const conversionMatchesCurrencies = Schema.makeFilter<CurrencyLinkedAmounts>(
  (transaction) =>
    (transaction.source.currency === transaction.base.currency) ===
    Predicate.isTagged(transaction.conversion, "SameCurrency"),
  {
    expected:
      "SameCurrency when the source currency is the base currency, Converted otherwise",
  }
);

const feeSharesSourceCurrency = Schema.makeFilter<CurrencyLinkedAmounts>(
  (transaction) =>
    Option.isNone(transaction.fee) ||
    transaction.fee.value.currency === transaction.source.currency,
  { expected: "a fee in the source currency" }
);

export const TransactionSchema = Schema.Struct({
  base: BaseAmountSchema,
  categorization: CategorizationSchema,
  classification: ClassificationSchema,
  conversion: ConversionSchema,
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
  source: MoneySchema,
  status: Schema.Literals(["posted", "pending", "reversed"]),
  valueDate: DateOnlySchema,
}).check(conversionMatchesCurrencies, feeSharesSourceCurrency);

export type Transaction = typeof TransactionSchema.Type;
