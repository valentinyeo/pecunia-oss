import { Effect, Option, Predicate, Schema } from "effect";

import { BaseAmount } from "./base-amount.js";
import type { RateLookup } from "./base-amount.js";
import type { Exact } from "./codec.js";
import { parse } from "./codec.js";
import { minorUnitsOf } from "./convert-minor.js";
import { ConvertedAmount, ConvertedAmountSchema } from "./converted-amount.js";
import type {
  ConversionInputInvalid,
  ConversionOverflow,
  CurrencyMismatch,
  MoneyOverflow,
  RateOnSameCurrency,
  RateUnavailable,
} from "./errors.js";
import { currencyMismatch, moneyOverflow } from "./errors.js";
import type {
  CurrencyCode,
  DateOnly,
  MinorUnits,
  Money,
} from "./primitives.js";
import { MoneySchema } from "./primitives.js";
import type { Rate } from "./rate.js";

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

const moneyOf = (currency: CurrencyCode, minor: MinorUnits): Money =>
  parse(MoneySchema, { currency, minor });

const mismatch = (
  left: CurrencyCode,
  right: CurrencyCode
): Effect.Effect<never, CurrencyMismatch> =>
  Effect.fail(currencyMismatch({ left, right }));

const combine = (
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

export const addMoney = (
  left: Money,
  right: Money
): Effect.Effect<Money, CurrencyMismatch | MoneyOverflow> =>
  combine(left, right, "add");

export const subtractMoney = (
  left: Money,
  right: Money
): Effect.Effect<Money, CurrencyMismatch | MoneyOverflow> =>
  combine(left, right, "subtract");

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

export const sourceAmount = (
  amounts: Amounts | typeof AmountsSchema.Type
): Money =>
  Predicate.isTagged(amounts, "Converted") ? amounts.source : amounts.amount;

export const sameCurrencyAmount = (amount: Money): SameCurrencyAmount =>
  parse(
    SameCurrencyAmountSchema,
    // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- the tag is written once here because the codec handle is the only strict door
    { _tag: "SameCurrency", amount }
  );

export const convertedAmounts = (
  source: Money,
  baseCurrency: CurrencyCode,
  rate: Rate,
  asOf: DateOnly
): Effect.Effect<
  ConvertedAmount,
  ConversionInputInvalid | ConversionOverflow | RateOnSameCurrency
> =>
  Effect.fromResult(
    ConvertedAmount.converting(source, baseCurrency, rate, asOf)
  );

export const convert = (
  money: Money,
  baseCurrency: CurrencyCode,
  lookup: RateLookup
): Effect.Effect<
  BaseAmount,
  ConversionInputInvalid | ConversionOverflow | RateUnavailable
> => BaseAmount.convert(money, baseCurrency, lookup);
