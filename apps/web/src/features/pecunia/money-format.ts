import {
  CurrencyCodeSchema,
  minorUnitExponent,
} from "@pecunia/investments/model";
import { Match, Option, Schema } from "effect";

import type { Minor } from "../../client/pecunia/money.js";

export interface ShownMoney {
  readonly currency: string;
  readonly minor: number;
}

const DIGITS_FOR_UNLISTED_CURRENCIES = 2;

const minorDigitsOf = (currency: string): number =>
  Option.match(Schema.decodeOption(CurrencyCodeSchema)(currency), {
    onNone: () => DIGITS_FOR_UNLISTED_CURRENCIES,
    onSome: minorUnitExponent,
  });

const grouped = (digits: string): string =>
  digits.length <= 3
    ? digits
    : `${grouped(digits.slice(0, -3))},${digits.slice(-3)}`;

const symbolFor = (currency: string): string =>
  Match.value(currency).pipe(
    Match.when("EUR", () => "€"),
    Match.when("GBP", () => "£"),
    Match.when("USD", () => "$"),
    Match.orElse(() => `${currency} `)
  );

export const formatMinor = (
  amountMinor: Minor | number,
  currency: string
): string => {
  const digits = minorDigitsOf(currency);
  const scale = 10 ** digits;
  const absolute = Math.abs(amountMinor);
  const major = Math.trunc(absolute / scale);
  const minor = absolute % scale;
  const sign = amountMinor < 0 ? "-" : "";

  const fraction =
    digits === 0 ? "" : `.${String(minor).padStart(digits, "0")}`;

  return `${sign}${symbolFor(currency)}${grouped(String(major))}${fraction}`;
};

export const formatMoney = (money: ShownMoney): string =>
  formatMinor(money.minor, money.currency);
