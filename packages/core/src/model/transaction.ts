import { Effect, Option, Predicate, Schema } from "effect";

import { ConversionOverflow } from "./conversion-overflow.js";
import { convertMinor } from "./money.js";
import type {
  BaseAmount,
  CurrencyCode,
  DateOnly,
  Money,
} from "./primitives.js";
import {
  BaseAmountSchema,
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
import { RateOnSameCurrency } from "./rate-on-same-currency.js";
import { RateSchema } from "./rate.js";
import type { Rate } from "./rate.js";

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

export interface ConvertedAmounts {
  readonly base: BaseAmount;
  readonly conversion: Conversion;
}

export const convertedAmounts = (
  source: Money,
  baseCurrency: CurrencyCode,
  rate: Rate,
  asOf: DateOnly
): Effect.Effect<ConvertedAmounts, ConversionOverflow | RateOnSameCurrency> =>
  source.currency === baseCurrency
    ? Effect.fail(new RateOnSameCurrency({ currency: source.currency }))
    : Option.match(
        convertMinor(source.minor, source.currency, baseCurrency, rate),
        {
          onNone: () =>
            Effect.fail(
              new ConversionOverflow({
                baseCurrency,
                currency: source.currency,
                minor: source.minor,
                rate,
              })
            ),
          onSome: (minor) =>
            Effect.succeed({
              base: Schema.decodeSync(BaseAmountSchema)({
                currency: baseCurrency,
                minor,
              }),
              conversion: ConversionSchema.cases.Converted.make({ asOf, rate }),
            }),
        }
      );

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

const sameCurrencyBaseMatchesSource = Schema.makeFilter<CurrencyLinkedAmounts>(
  (transaction) =>
    !Predicate.isTagged(transaction.conversion, "SameCurrency") ||
    transaction.base.minor === transaction.source.minor,
  { expected: "a base amount equal to the source amount when no rate applies" }
);

const convertedBaseMatchesRate = Schema.makeFilter<CurrencyLinkedAmounts>(
  (transaction) =>
    !Predicate.isTagged(transaction.conversion, "Converted") ||
    Option.match(
      convertMinor(
        transaction.source.minor,
        transaction.source.currency,
        transaction.base.currency,
        transaction.conversion.rate
      ),
      {
        onNone: () => false,
        onSome: (minor) => minor === transaction.base.minor,
      }
    ),
  { expected: "a base amount equal to the converted source amount" }
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
}).check(
  conversionMatchesCurrencies,
  sameCurrencyBaseMatchesSource,
  convertedBaseMatchesRate,
  feeSharesSourceCurrency
);

export type Transaction = typeof TransactionSchema.Type;
