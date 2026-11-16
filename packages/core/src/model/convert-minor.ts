import { Option, Result } from "effect";

import { parse } from "./codec.js";
import type { ConversionInputInvalid, ConversionOverflow } from "./errors.js";
import { conversionInputInvalid, conversionOverflow } from "./errors.js";
import type { CurrencyCode, MinorUnits } from "./primitives.js";
import { MinorUnitsSchema } from "./primitives.js";
import { RATE_SCALE_FACTOR } from "./rate.js";
import type { Rate } from "./rate.js";

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

export const minorUnitsOf = (minor: bigint): Option.Option<MinorUnits> =>
  minor >= BigInt(Number.MIN_SAFE_INTEGER) &&
  minor <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Option.some(parse(MinorUnitsSchema, Number(minor)))
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

const invalidReason = (
  minor: number
): "fractional" | "not-finite" | "unsafe" => {
  if (!Number.isFinite(minor)) {
    return "not-finite";
  }

  return Number.isInteger(minor) ? "unsafe" : "fractional";
};

export const convertMinor = (
  minor: MinorUnits,
  from: CurrencyCode,
  to: CurrencyCode,
  rate: Rate
): Result.Result<MinorUnits, ConversionInputInvalid | ConversionOverflow> => {
  if (!Number.isSafeInteger(minor)) {
    return Result.fail(
      conversionInputInvalid({ from, reason: invalidReason(minor), to })
    );
  }

  const converted =
    from === to
      ? BigInt(minor)
      : divideRoundHalfAwayFromZero(
          BigInt(minor) * rate * 10n ** BigInt(minorUnitExponent(to)),
          10n ** BigInt(minorUnitExponent(from)) * RATE_SCALE_FACTOR
        );

  return Option.match(minorUnitsOf(converted), {
    onNone: () =>
      Result.fail(
        conversionOverflow({
          baseCurrency: to,
          currency: from,
          minor,
          rate,
        })
      ),
    onSome: (value) => Result.succeed(value),
  });
};
