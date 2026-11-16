import type { CurrencyCode, Minor } from "../../client/pecunia/money.js";

const minorUnitsPerMajor = 100;

const symbolByCurrency = {
  EUR: "€",
  GBP: "£",
  USD: "$",
} satisfies Readonly<Record<CurrencyCode, string>>;

const grouped = (digits: string): string =>
  digits.length <= 3
    ? digits
    : `${grouped(digits.slice(0, -3))},${digits.slice(-3)}`;

const padded = (minor: number): string =>
  String(minor).padStart(2, "0").slice(-2);

export const formatMinor = (
  amountMinor: Minor,
  currency: CurrencyCode
): string => {
  const absolute = Math.abs(amountMinor);
  const major = Math.trunc(absolute / minorUnitsPerMajor);
  const minor = absolute % minorUnitsPerMajor;
  const sign = amountMinor < 0 ? "-" : "";

  return `${sign}${symbolByCurrency[currency]}${grouped(String(major))}.${padded(minor)}`;
};
