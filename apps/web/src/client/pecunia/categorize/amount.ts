import { Result } from "effect";

import { minorUnits } from "../money.js";
import type { Minor } from "../money.js";

const MINOR_DIGITS = 2;

const minorPerMajor = 100;

const AMOUNT_PATTERN = new RegExp(
  `^(?<major>\\d+)(?:\\.(?<minor>\\d{1,${MINOR_DIGITS}}))?$`,
  "u"
);

export const amountRefusal =
  "That amount is not a number. An amount is pounds (£) with up to two decimals. Fix: type a whole number of pounds such as `50` or `50.00`.";

const pad = (value: string): string => value.padEnd(MINOR_DIGITS, "0");

export const majorTextOf = (minor: Minor): string => {
  const major = Math.trunc(minor / minorPerMajor);
  const rest = Math.abs(minor % minorPerMajor);

  return `${major}.${String(rest).padStart(MINOR_DIGITS, "0")}`;
};

export const parseMajorText = (text: string): Result.Result<Minor, string> => {
  const match = AMOUNT_PATTERN.exec(text.trim());

  if (match === null) {
    return Result.fail(amountRefusal);
  }

  const major = match.groups?.major ?? "0";
  const rest = pad(match.groups?.minor ?? "");
  const minor = Number(major) * minorPerMajor + Number(rest);

  return Number.isSafeInteger(minor)
    ? Result.succeed(minorUnits(minor))
    : Result.fail(amountRefusal);
};
