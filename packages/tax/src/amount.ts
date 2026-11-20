import { codecs, minorUnitExponent, parse } from "@pecunia/core/model";
import type { CurrencyCode, MinorUnits } from "@pecunia/core/model";
import { Result, Schema } from "effect";

export const AmountRejectionSchema = Schema.Literals([
  "NotADecimal",
  "TooManyFractionDigits",
  "OutOfRange",
]);

export type AmountRejection = typeof AmountRejectionSchema.Type;

const decimal = /^(?<sign>-?)(?<whole>\d+)(?:\.(?<fraction>\d+))?$/u;

export const decimalTextOf = (
  minor: MinorUnits,
  currency: CurrencyCode
): string => {
  const exponent = minorUnitExponent(currency);
  const magnitude = BigInt(minor) * (minor < 0 ? -1n : 1n);
  const digits = magnitude.toString().padStart(exponent + 1, "0");
  const split = digits.length - exponent;
  const whole = digits.slice(0, split);
  const fraction = digits.slice(split);

  return `${minor < 0 ? "-" : ""}${whole}${exponent === 0 ? "" : `.${fraction}`}`;
};

export const parseDecimalAmount = (
  text: string,
  currency: CurrencyCode
): Result.Result<MinorUnits, AmountRejection> => {
  const match = decimal.exec(text);

  if (match === null) {
    return Result.fail("NotADecimal");
  }

  const { fraction = "", sign = "", whole = "" } = match.groups ?? {};
  const exponent = minorUnitExponent(currency);

  if (fraction.length > exponent) {
    return Result.fail("TooManyFractionDigits");
  }

  const minor = BigInt(`${sign}${whole}${fraction.padEnd(exponent, "0")}`);

  if (
    minor > BigInt(Number.MAX_SAFE_INTEGER) ||
    minor < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    return Result.fail("OutOfRange");
  }

  return Result.succeed(parse(codecs.minorUnits, Number(minor)));
};
