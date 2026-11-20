import { convertMinor } from "@pecunia/core/model";
import { Option, Result, Schema } from "effect";

import { MoneySchema } from "./model.js";
import type { CurrencyCode, Money, Quantity, RateLookup } from "./model.js";

const QUANTITY_SCALE = 1_000_000n;

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const roundHalfAwayFromZero = (
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

export const exactMoney = (
  currency: CurrencyCode,
  minor: bigint
): Result.Result<Money, "out-of-range"> =>
  minor >= MIN_SAFE && minor <= MAX_SAFE
    ? Result.succeed(
        Schema.decodeSync(MoneySchema)({ currency, minor: Number(minor) })
      )
    : Result.fail("out-of-range");

export const positionValue = (
  quantity: Quantity,
  price: Money
): Result.Result<Money, "out-of-range"> =>
  exactMoney(
    price.currency,
    roundHalfAwayFromZero(
      BigInt(quantity) * BigInt(price.minor),
      QUANTITY_SCALE
    )
  );

export const sumOf = (
  currency: CurrencyCode,
  amounts: readonly Money[]
): Result.Result<Money, "out-of-range"> => {
  let total = 0n;

  for (const amount of amounts) {
    total += BigInt(amount.minor);
  }

  return exactMoney(currency, total);
};

export const differenceOf = (
  currency: CurrencyCode,
  left: Money,
  right: Money
): Result.Result<Money, "out-of-range"> =>
  exactMoney(currency, BigInt(left.minor) - BigInt(right.minor));

export const convertMoney = (
  money: Money,
  to: CurrencyCode,
  lookup: RateLookup
): Result.Result<Money, "no-rate" | "out-of-range"> =>
  money.currency === to
    ? Result.succeed(money)
    : Option.match(lookup(money.currency, to), {
        onNone: () => Result.fail("no-rate"),
        onSome: (rate) =>
          Result.match(convertMinor(money.minor, money.currency, to, rate), {
            onFailure: () => Result.fail("out-of-range"),
            onSuccess: (minor) => exactMoney(to, BigInt(minor)),
          }),
      });
