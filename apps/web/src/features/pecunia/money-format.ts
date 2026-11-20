import type { CurrencyCode, Minor } from "../../client/pecunia/money.js";

export interface ShownMoney {
  readonly currency: string;
  readonly minor: number;
}

const minorUnitsPerMajor = 100;

const symbolFor = (currency: string): string => {
  if (currency === "EUR") {
    return "€";
  }

  if (currency === "GBP") {
    return "£";
  }

  return currency === "USD" ? "$" : `${currency} `;
};

const grouped = (digits: string): string =>
  digits.length <= 3
    ? digits
    : `${grouped(digits.slice(0, -3))},${digits.slice(-3)}`;

const padded = (minor: number): string =>
  String(minor).padStart(2, "0").slice(-2);

export const formatMoney = (money: ShownMoney): string => {
  const absolute = Math.abs(money.minor);
  const major = Math.trunc(absolute / minorUnitsPerMajor);
  const minor = absolute % minorUnitsPerMajor;
  const sign = money.minor < 0 ? "-" : "";

  return `${sign}${symbolFor(money.currency)}${grouped(String(major))}.${padded(minor)}`;
};

export const formatMinor = (
  amountMinor: Minor,
  currency: CurrencyCode
): string => formatMoney({ currency, minor: amountMinor });
