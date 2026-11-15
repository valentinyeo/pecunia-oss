import { Effect, Option, Schema } from "effect";

import { ConversionOverflow } from "./conversion-overflow.js";
import { CurrencyMismatch } from "./currency-mismatch.js";
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

export { RateUnavailable } from "./rate-unavailable.js";

export interface ConversionQuery {
  readonly from: CurrencyCode;
  readonly to: CurrencyCode;
}

export type RateLookup = (query: ConversionQuery) => Option.Option<Rate>;

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
        divideRoundHalfAwayFromZero(BigInt(minor) * rate, RATE_SCALE_FACTOR)
      );

const mismatch = (
  left: CurrencyCode,
  right: CurrencyCode
): Effect.Effect<never, CurrencyMismatch> =>
  Effect.fail(new CurrencyMismatch({ left, right }));

export const addMoney = (
  left: Money,
  right: Money
): Effect.Effect<Money, CurrencyMismatch> =>
  left.currency === right.currency
    ? Effect.succeed(moneyOf(left.currency, left.minor + right.minor))
    : mismatch(left.currency, right.currency);

export const subtractMoney = (
  left: Money,
  right: Money
): Effect.Effect<Money, CurrencyMismatch> =>
  left.currency === right.currency
    ? Effect.succeed(moneyOf(left.currency, left.minor - right.minor))
    : mismatch(left.currency, right.currency);

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
