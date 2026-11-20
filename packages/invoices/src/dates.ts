import type { DateOnly } from "./model.js";

const monthOffsets = [
  0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
] as const;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysBeforeYear = (year: number): number => {
  const previous = year - 1;

  return (
    year * 365 +
    Math.floor(previous / 4) -
    Math.floor(previous / 100) +
    Math.floor(previous / 400)
  );
};

const daysBeforeMonth = (year: number, month: number): number => {
  const offset = monthOffsets[month - 1] ?? 0;

  return month > 2 && isLeapYear(year) ? offset + 1 : offset;
};

export const dayNumber = (date: DateOnly): number => {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);

  return daysBeforeYear(year) + daysBeforeMonth(year, month) + day;
};

export const daysApart = (left: DateOnly, right: DateOnly): number =>
  Math.abs(dayNumber(left) - dayNumber(right));
