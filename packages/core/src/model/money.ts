import { Effect, Option, Predicate, Result, Schema } from "effect";

import { convertOperation } from "./base-amount.js";
import type { Exact } from "./codec.js";
import { decodeModel } from "./codec.js";
import { minorUnitsOf } from "./convert-minor.js";
import { ConvertedAmount, ConvertedAmountSchema } from "./converted-amount.js";
import type {
  ConversionInputInvalid,
  ConversionOverflow,
  CurrencyMismatch,
  MoneyOverflow,
  RateOnSameCurrency,
} from "./errors.js";
import { currencyMismatch, moneyOverflow } from "./errors.js";
import type { Operation } from "./operation.js";
import {
  carries,
  codeArgument,
  codeSample,
  dateArgument,
  dateSample,
  effectOperation,
  moneyArgument,
  moneySample,
  valueOperation,
} from "./operation.js";
import type {
  CurrencyCode,
  DateOnly,
  MinorUnits,
  Money,
} from "./primitives.js";
import {
  CurrencyCodeSchema,
  DateOnlySchema,
  MoneySchema,
} from "./primitives.js";
import type { Rate } from "./rate.js";
import { rateArgument, rateSample } from "./rate.js";

export { BaseAmount } from "./base-amount.js";

export type { ConversionQuery, RateLookup } from "./base-amount.js";

export { convertMinor, minorUnitExponent } from "./convert-minor.js";

export type {
  ConversionInputInvalid,
  ConversionInputInvalidFields,
} from "./errors.js";

export type { ConversionOverflow, ConversionOverflowFields } from "./errors.js";

export { ConvertedAmount } from "./converted-amount.js";

export type { StoredConversion } from "./converted-amount.js";

export type { CurrencyMismatch, CurrencyMismatchFields } from "./errors.js";

export type { MoneyOverflow, MoneyOverflowFields } from "./errors.js";

export type { RateUnavailable, RateUnavailableFields } from "./errors.js";

const mismatch = (
  left: CurrencyCode,
  right: CurrencyCode
): Effect.Effect<never, CurrencyMismatch> =>
  Effect.fail(currencyMismatch({ left, right }));

const moneyOf = (currency: CurrencyCode, minor: MinorUnits): Money =>
  decodeModel(MoneySchema, { currency, minor });

const combineRun = (
  left: Money,
  right: Money,
  operation: "add" | "subtract"
): Effect.Effect<Money, CurrencyMismatch | MoneyOverflow> => {
  if (left.currency !== right.currency) {
    return mismatch(left.currency, right.currency);
  }

  const total =
    operation === "add"
      ? BigInt(left.minor) + BigInt(right.minor)
      : BigInt(left.minor) - BigInt(right.minor);

  return Option.match(minorUnitsOf(total), {
    onNone: () =>
      Effect.fail(
        moneyOverflow({
          currency: left.currency,
          left: left.minor,
          operation,
          right: right.minor,
        })
      ),
    onSome: (minor) => Effect.succeed(moneyOf(left.currency, minor)),
  });
};

export const addMoneyOperation: Operation<
  [Money, Money],
  Effect.Effect<Money, CurrencyMismatch | MoneyOverflow | Schema.SchemaError>
> = effectOperation({
  arguments: [moneyArgument(), moneyArgument()],
  name: "addMoney",
  run: (left: Money, right: Money) => combineRun(left, right, "add"),
  samples: () => [moneySample(), moneySample()],
});

export const subtractMoneyOperation: Operation<
  [Money, Money],
  Effect.Effect<Money, CurrencyMismatch | MoneyOverflow | Schema.SchemaError>
> = effectOperation({
  arguments: [moneyArgument(), moneyArgument()],
  name: "subtractMoney",
  run: (left: Money, right: Money) => combineRun(left, right, "subtract"),
  samples: () => [moneySample(), moneySample()],
});

export const addMoney: typeof addMoneyOperation.apply = addMoneyOperation.apply;

export const subtractMoney: typeof subtractMoneyOperation.apply =
  subtractMoneyOperation.apply;

export const SameCurrencyAmountSchema = Schema.TaggedStruct("SameCurrency", {
  amount: MoneySchema,
});

export const AmountsSchema = Schema.Union([
  ConvertedAmountSchema,
  SameCurrencyAmountSchema,
]);

export type Amounts = Exact<typeof AmountsSchema.Type>;

export type SameCurrencyAmount = Extract<
  Amounts,
  { readonly _tag: "SameCurrency" }
>;

const sourceAmountRun = (amounts: Amounts): Money =>
  Predicate.isTagged(amounts, "Converted") ? amounts.source : amounts.amount;

export const sourceOfAmounts = sourceAmountRun;

const sameCurrencyAmountRun = (amount: Money): SameCurrencyAmount =>
  decodeModel(
    SameCurrencyAmountSchema,
    // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- the tag is written once here because the codec handle is the only strict door
    { _tag: "SameCurrency", amount }
  );

const amountsSample = (): Amounts =>
  Result.getOrThrow(
    ConvertedAmount.converting(
      moneySample(),
      decodeModel(CurrencyCodeSchema, "GBP"),
      rateSample(),
      decodeModel(DateOnlySchema, "2024-01-30")
    )
  );

export const sourceAmountOperation: Operation<[Amounts], Money> =
  valueOperation({
    arguments: [carries("Amounts", AmountsSchema, amountsSample)],
    name: "sourceAmount",
    run: sourceAmountRun,
    samples: () => [amountsSample()],
  });

export const sameCurrencyAmountOperation: Operation<
  [Money],
  SameCurrencyAmount
> = valueOperation({
  arguments: [moneyArgument()],
  name: "sameCurrencyAmount",
  run: sameCurrencyAmountRun,
  samples: () => [moneySample()],
});

export const sourceAmount: typeof sourceAmountOperation.apply =
  sourceAmountOperation.apply;

export const sameCurrencyAmount: typeof sameCurrencyAmountOperation.apply =
  sameCurrencyAmountOperation.apply;

export const convertedAmountsOperation: Operation<
  [Money, CurrencyCode, Rate, DateOnly],
  Effect.Effect<
    ConvertedAmount,
    | ConversionInputInvalid
    | ConversionOverflow
    | RateOnSameCurrency
    | Schema.SchemaError
  >
> = effectOperation({
  arguments: [moneyArgument(), codeArgument(), rateArgument(), dateArgument()],
  name: "convertedAmounts",
  run: (
    source: Money,
    baseCurrency: CurrencyCode,
    rate: Rate,
    asOf: DateOnly
  ) =>
    Effect.fromResult(
      ConvertedAmount.converting(source, baseCurrency, rate, asOf)
    ),
  samples: () => [moneySample(), codeSample("GBP"), rateSample(), dateSample()],
});

export const convertedAmounts: typeof convertedAmountsOperation.apply =
  convertedAmountsOperation.apply;

export const convert: typeof convertOperation.apply = convertOperation.apply;
