import { Option, Result } from "effect";
import type { Schema } from "effect";

import { decodeModel } from "./codec.js";
import type { ConversionInputInvalid, ConversionOverflow } from "./errors.js";
import { conversionInputInvalid, conversionOverflow } from "./errors.js";
import {
  carries,
  codeArgument,
  codeSample,
  moneySample,
  resultOperation,
  valueOperation,
} from "./operation.js";
import type { Operation } from "./operation.js";
import type { CurrencyCode, MinorUnits } from "./primitives.js";
import { MinorUnitsSchema } from "./primitives.js";
import {
  RATE_SCALE_FACTOR,
  rateArgument,
  rateSample,
  rateText,
} from "./rate.js";
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

const minorUnitExponentRun = (currency: CurrencyCode): number =>
  minorUnitExponents.get(currency) ?? 2;

export const minorUnitExponentOperation: Operation<[CurrencyCode], number> =
  valueOperation({
    arguments: [codeArgument()],
    name: "minorUnitExponent",
    run: minorUnitExponentRun,
    samples: () => [codeSample("JPY")],
  });

export const minorUnitExponent: typeof minorUnitExponentOperation.apply =
  minorUnitExponentOperation.apply;

export const minorUnitsOf = (minor: bigint): Option.Option<MinorUnits> =>
  minor >= BigInt(Number.MIN_SAFE_INTEGER) &&
  minor <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Object.freeze(Option.some(decodeModel(MinorUnitsSchema, Number(minor))))
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

const convertMinorRun = (
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
          rate: rateText(rate),
        })
      ),
    onSome: (value) => Result.succeed(value),
  });
};

export const convertMinorOperation: Operation<
  [MinorUnits, CurrencyCode, CurrencyCode, Rate],
  Result.Result<
    MinorUnits,
    ConversionInputInvalid | ConversionOverflow | Schema.SchemaError
  >
> = resultOperation({
  arguments: [
    carries("MinorUnits", MinorUnitsSchema, () => moneySample().minor),
    codeArgument(),
    codeArgument(),
    rateArgument(),
  ],
  name: "convertMinor",
  run: convertMinorRun,
  samples: () => [
    moneySample().minor,
    codeSample("USD"),
    codeSample("GBP"),
    rateSample(),
  ],
});

export const convertMinor: typeof convertMinorOperation.apply =
  convertMinorOperation.apply;
