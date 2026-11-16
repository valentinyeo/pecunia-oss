import { Effect, Option, Schema } from "effect";

import { ConversionOverflow } from "./conversion-overflow.js";
import { CurrencyMismatch } from "./currency-mismatch.js";
import { MoneyOverflow } from "./money-overflow.js";
import type {
  BaseAmount,
  CurrencyCode,
  MinorUnits,
  Money,
} from "./primitives.js";
import {
  BaseAmountSchema,
  MinorUnitsSchema,
  MoneySchema,
} from "./primitives.js";
import { RateUnavailable } from "./rate-unavailable.js";
import { RATE_SCALE_FACTOR } from "./rate.js";
import type { Rate } from "./rate.js";

export { ConversionOverflow } from "./conversion-overflow.js";

export { CurrencyMismatch } from "./currency-mismatch.js";

export { MoneyOverflow } from "./money-overflow.js";

export { RateUnavailable } from "./rate-unavailable.js";

export interface ConversionQuery {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
}

export type RateLookup = (query: ConversionQuery) => Option.Option<Rate>;

const minorUnitExponents = new Map([
  ["BHD", 3],
  ["BIF", 0],
  ["CLF", 4],
  ["CLP", 0],
  ["DJF", 0],
  ["GNF", 0],
  ["IQD", 3],
  ["ISK", 0],
  ["JOD", 3],
  ["JPY", 0],
  ["KMF", 0],
  ["KRW", 0],
  ["KWD", 3],
  ["LYD", 3],
  ["OMR", 3],
  ["PYG", 0],
  ["RWF", 0],
  ["TND", 3],
  ["UGX", 0],
  ["UYI", 0],
  ["UYW", 4],
  ["VND", 0],
  ["VUV", 0],
  ["XAF", 0],
  ["XOF", 0],
  ["XPF", 0],
]);

export const minorUnitExponent = (currency: CurrencyCode): number =>
  minorUnitExponents.get(currency) ?? 2;

const moneyOf = (currency: CurrencyCode, minor: number): Money =>
  Schema.decodeSync(MoneySchema)({ currency, minor });

const baseAmountOf = (currency: CurrencyCode, minor: number): BaseAmount =>
  Schema.decodeSync(BaseAmountSchema)({ currency, minor });

const minorUnitsOf = (minor: bigint): Option.Option<MinorUnits> =>
  minor >= BigInt(Number.MIN_SAFE_INTEGER) &&
  minor <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Option.some(Schema.decodeSync(MinorUnitsSchema)(Number(minor)))
    : Option.none();

const divideRoundHalfAwayFromZero = (
  numerator: bigint,
  denominator: bigint
): bigint => {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = (remainder < 0n ? -remainder : remainder) * 2n;

  return doubled >= denominator
    ? quotient + (numerator < 0n ? -1n : 1n)
    : quotient;
};

export const convertMinor = (
  minor: number,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: Rate
): Option.Option<MinorUnits> =>
  from === to
    ? minorUnitsOf(BigInt(minor))
    : minorUnitsOf(
        divideRoundHalfAwayFromZero(
          BigInt(minor) * rate * 10n ** BigInt(minorUnitExponent(to)),
          10n ** BigInt(minorUnitExponent(from)) * RATE_SCALE_FACTOR
        )
      );

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

export const convert = (
  money: Money,
  baseCurrency: CurrencyCode,
  lookup: RateLookup
): Effect.Effect<BaseAmount, ConversionOverflow | RateUnavailable> =>
  money.currency === baseCurrency
    ? Effect.succeed(baseAmountOf(money.currency, money.minor))
    : Option.match(lookup({ from: money.currency, to: baseCurrency }), {
        onNone: () =>
          Effect.fail(
            new RateUnavailable({ from: money.currency, to: baseCurrency })
          ),
        onSome: (rate) =>
          Option.match(
            convertMinor(money.minor, money.currency, baseCurrency, rate),
            {
              onNone: () =>
                Effect.fail(
                  new ConversionOverflow({
                    baseCurrency,
                    currency: money.currency,
                    minor: money.minor,
                    rate,
                  })
                ),
              onSome: (minor) =>
                Effect.succeed(baseAmountOf(baseCurrency, minor)),
            }
          ),
      });
