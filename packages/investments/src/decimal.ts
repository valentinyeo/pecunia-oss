import { minorUnitExponent } from "@pecunia/core/model";
import { Option, Schema } from "effect";

import { MoneySchema, QuantitySchema } from "./model.js";
import type { CurrencyCode, Money, Quantity } from "./model.js";

const decimalPattern = /^(?<whole>\d{1,18})(?:\.(?<fraction>\d{1,18}))?$/u;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export const decimalUnits = (
  text: string,
  exponent: number
): Option.Option<bigint> => {
  const match = decimalPattern.exec(text);
  const groups = match?.groups;

  if (groups === undefined) {
    return Option.none();
  }

  const whole = groups.whole ?? "";
  const fraction = groups.fraction ?? "";

  if (fraction.length > exponent) {
    return Option.none();
  }

  return Option.some(BigInt(`${whole}${fraction.padEnd(exponent, "0")}`));
};

export const quantityOfText = (text: string): Option.Option<Quantity> =>
  Option.flatMap(decimalUnits(text, 6), (units) =>
    units <= MAX_SAFE
      ? Schema.decodeOption(QuantitySchema)(Number(units))
      : Option.none()
  );

export const moneyOfText = (
  text: string,
  currency: CurrencyCode
): Option.Option<Money> =>
  Option.flatMap(decimalUnits(text, minorUnitExponent(currency)), (units) =>
    units <= MAX_SAFE && units >= -MAX_SAFE
      ? Schema.decodeOption(MoneySchema)({ currency, minor: Number(units) })
      : Option.none()
  );
