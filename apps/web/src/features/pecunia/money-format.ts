import { Match } from "effect";

import type { Minor } from "../../client/pecunia/money.js";

const minorUnitsPerMajor = 100;

const grouped = (digits: string): string =>
  digits.length <= 3
    ? digits
    : `${grouped(digits.slice(0, -3))},${digits.slice(-3)}`;

const padded = (minor: number): string =>
  String(minor).padStart(2, "0").slice(-2);

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
  const absolute = Math.abs(amountMinor);
  const major = Math.trunc(absolute / minorUnitsPerMajor);
  const minor = absolute % minorUnitsPerMajor;
  const sign = amountMinor < 0 ? "-" : "";

  return `${sign}${symbolFor(currency)}${grouped(String(major))}.${padded(minor)}`;
};
