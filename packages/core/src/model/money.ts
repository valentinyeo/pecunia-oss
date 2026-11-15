import { Effect, Option, Schema } from "effect";

import { CurrencyMismatch } from "./currency-mismatch.js";
import type { BaseAmount, CurrencyCode, Money, Rate } from "./primitives.js";
import { BaseAmountSchema, MoneySchema } from "./primitives.js";
import { RateUnavailable } from "./rate-unavailable.js";

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

const roundHalfAwayFromZero = (minor: number, rate: Rate): number => {
  const scaled = minor * rate;

  return Math.sign(scaled) * Math.round(Math.abs(scaled));
};

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
): Effect.Effect<BaseAmount, RateUnavailable> =>
  money.currency === baseCurrency
    ? Effect.succeed(baseAmountOf(money.currency, money.minor))
    : Option.match(lookup({ from: money.currency, to: baseCurrency }), {
        onNone: () =>
          Effect.fail(
            new RateUnavailable({ from: money.currency, to: baseCurrency })
          ),
        onSome: (rate) =>
          Effect.succeed(
            baseAmountOf(baseCurrency, roundHalfAwayFromZero(money.minor, rate))
          ),
      });
