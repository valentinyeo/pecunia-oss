import { Effect, Option, Schema } from "effect";

import type { ReportOverflow } from "./errors.js";
import { overflowOf } from "./errors.js";
import type {
  CurrencyCode,
  MinorUnits,
  Money,
  ShareBasisPoints,
} from "./model.js";
import {
  MinorUnitsSchema,
  MoneySchema,
  ShareBasisPointsSchema,
} from "./model.js";

export const moneyOf = (currency: CurrencyCode, minor: MinorUnits): Money =>
  Schema.decodeSync(MoneySchema)({ currency, minor });

export const zeroShare: ShareBasisPoints = Schema.decodeSync(
  ShareBasisPointsSchema
)(0);

export const minorOf = (value: bigint): Option.Option<MinorUnits> =>
  value >= BigInt(Number.MIN_SAFE_INTEGER) &&
  value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Option.some(Schema.decodeSync(MinorUnitsSchema)(Number(value)))
    : Option.none();

export const minorOrOverflow = (
  value: bigint,
  what: string
): Effect.Effect<MinorUnits, ReportOverflow> =>
  Effect.fromOption(minorOf(value), () => overflowOf(what));

export const shareOf = (value: bigint): Option.Option<ShareBasisPoints> =>
  value >= BigInt(Number.MIN_SAFE_INTEGER) &&
  value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Option.some(Schema.decodeSync(ShareBasisPointsSchema)(Number(value)))
    : Option.none();

export const sumOf = (values: Iterable<bigint>): bigint => {
  let total = 0n;

  for (const value of values) {
    total += value;
  }

  return total;
};

export const compareText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

export const roundHalfAwayFromZero = (
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
