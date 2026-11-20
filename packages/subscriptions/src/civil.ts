import { Option } from "effect";

export interface CivilDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

const ISO_DATE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const monthLength = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (MONTH_LENGTHS[month - 1] ?? 0);

export const civilOf = (text: string): Option.Option<CivilDate> => {
  const [, year = "", month = "", day = ""] = ISO_DATE.exec(text) ?? [];

  if (year === "" || month === "" || day === "") {
    return Option.none();
  }

  const parts: CivilDate = {
    day: Number(day),
    month: Number(month),
    year: Number(year),
  };

  const isCalendarDate =
    parts.month >= 1 &&
    parts.month <= 12 &&
    parts.day >= 1 &&
    parts.day <= monthLength(parts.year, parts.month);

  return isCalendarDate ? Option.some(parts) : Option.none();
};

export const isCalendarDate = (text: string): boolean =>
  Option.isSome(civilOf(text));

export const civilDateOf = (text: string): CivilDate => {
  const found = civilOf(text);

  if (Option.isNone(found)) {
    throw new Error(
      `${text} is not a calendar date. Fix: validate it with \`DateOnlySchema\` before reading its parts.`
    );
  }

  return found.value;
};

const pad = (value: number, width: number): string =>
  `${value}`.padStart(width, "0");

export const formatCivil = (date: CivilDate): string =>
  `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`;

export const dayNumberOf = (text: string): number => {
  const { day, month, year } = civilDateOf(text);
  const shifted = month <= 2 ? year - 1 : year;
  const era = Math.floor(shifted / 400);
  const yearOfEra = shifted - era * 400;

  const dayOfYear =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;

  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;

  return era * 146_097 + dayOfEra - 719_468;
};

export const civilDateOfDayNumber = (dayNumber: number): CivilDate => {
  const shifted = dayNumber + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;

  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365
  );

  const year = yearOfEra + era * 400;

  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));

  const monthIndex = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthIndex + 2) / 5) + 1;
  const month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9;

  return { day, month, year: month <= 2 ? year + 1 : year };
};

export const shiftDays = (text: string, days: number): string =>
  formatCivil(civilDateOfDayNumber(dayNumberOf(text) + days));

export const shiftMonths = (text: string, months: number): string => {
  const date = civilDateOf(text);
  const index = date.month - 1 + months;
  const year = date.year + Math.floor(index / 12);
  const month = (((index % 12) + 12) % 12) + 1;

  return formatCivil({
    day: Math.min(date.day, monthLength(year, month)),
    month,
    year,
  });
};

export const daysBetween = (from: string, to: string): number =>
  dayNumberOf(to) - dayNumberOf(from);
