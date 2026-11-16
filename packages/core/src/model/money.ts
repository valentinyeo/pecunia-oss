import { Effect, Option, Predicate, Schema } from "effect";

import { BaseAmount } from "./base-amount.js";
import type { RateLookup } from "./base-amount.js";
import { closedUnion } from "./closed-union.js";
import type { ConversionInputInvalid } from "./conversion-input-invalid.js";
import type { ConversionOverflow } from "./conversion-overflow.js";
import { minorUnitsOf } from "./convert-minor.js";
import { ConvertedAmount, ConvertedAmountSchema } from "./converted-amount.js";
import { CurrencyMismatch } from "./currency-mismatch.js";
import { MoneyOverflow } from "./money-overflow.js";
import { strictParseOptions } from "./parse-options.js";
import type {
  CurrencyCode,
  DateOnly,
  MinorUnits,
  Money,
} from "./primitives.js";
import { MoneySchema } from "./primitives.js";
import type { RateOnSameCurrency } from "./rate-on-same-currency.js";
import type { RateUnavailable } from "./rate-unavailable.js";
import type { Rate } from "./rate.js";

export { BaseAmount } from "./base-amount.js";

export type { ConversionQuery, RateLookup } from "./base-amount.js";

export { convertMinor, minorUnitExponent } from "./convert-minor.js";

export { ConversionInputInvalid } from "./conversion-input-invalid.js";

export { ConversionOverflow } from "./conversion-overflow.js";

export { ConvertedAmount } from "./converted-amount.js";

export type { StoredConversion } from "./converted-amount.js";

export { CurrencyMismatch } from "./currency-mismatch.js";

export { MoneyOverflow } from "./money-overflow.js";

export { RateUnavailable } from "./rate-unavailable.js";

const moneyOf = (currency: CurrencyCode, minor: MinorUnits): Money =>
  Schema.decodeSync(MoneySchema, strictParseOptions)({ currency, minor });

const mismatch = (
  left: CurrencyCode,
  right: CurrencyCode
): Effect.Effect<never, CurrencyMismatch> =>
  Effect.fail(new CurrencyMismatch({ left, right }));

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
        new MoneyOverflow({
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

export type SameCurrencyAmount = typeof SameCurrencyAmountSchema.Type;

export const AmountsSchema = closedUnion([
  ConvertedAmountSchema,
  SameCurrencyAmountSchema,
]);

export type Amounts = typeof AmountsSchema.Type;

export const sourceAmount = (amounts: Amounts): Money =>
  Predicate.isTagged(amounts, "Converted") ? amounts.source : amounts.amount;

export const sameCurrencyAmount = (amount: Money): SameCurrencyAmount =>
  SameCurrencyAmountSchema.make({ amount });

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
