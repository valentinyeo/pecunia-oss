import { Match, Schema } from "effect";

import type { Bound, DateOnly, PeriodChoice, YearMonth } from "./model.js";
import { BoundSchema, DateOnlySchema, YearMonthSchema } from "./model.js";

const wholeBook = BoundSchema.cases.All.make({});

const pad = (value: number, width: number): string =>
  String(value).padStart(width, "0");

const yearMonthOf = (text: string): YearMonth =>
  Schema.decodeSync(YearMonthSchema)(text);

const dateOfText = (text: string): DateOnly =>
  Schema.decodeSync(DateOnlySchema)(text);

export const boundOf = (from: DateOnly, to: DateOnly): Bound =>
  BoundSchema.cases.Between.make({ from, to });

export const dateOf = (ordinal: number): DateOnly => {
  const shifted = ordinal + 719_468;
  const era = Math.floor(shifted / 146_097);
  const dayOfEra = shifted - era * 146_097;

  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365
  );

  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));

  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);

  return dateOfText(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
};

export const ordinalOf = (date: DateOnly): number => {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const shiftedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const monthShift = month > 2 ? month - 3 : month + 9;
  const dayOfYear = Math.floor((153 * monthShift + 2) / 5) + day - 1;

  return (
    era * 146_097 +
    (yearOfEra * 365 +
      Math.floor(yearOfEra / 4) -
      Math.floor(yearOfEra / 100) +
      dayOfYear) -
    719_468
  );
};

export const addDays = (date: DateOnly, days: number): DateOnly =>
  dateOf(ordinalOf(date) + days);

export const monthOfDate = (date: DateOnly): YearMonth =>
  yearMonthOf(date.slice(0, 7));

export const monthLength = (month: YearMonth): number => {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return number === 2 && leap ? 29 : (lengths[number - 1] ?? 0);
};

export const startOfMonth = (month: YearMonth): DateOnly =>
  dateOfText(`${month}-01`);

export const endOfMonth = (month: YearMonth): DateOnly =>
  dateOfText(`${month}-${pad(monthLength(month), 2)}`);

export const monthBound = (month: YearMonth): Bound =>
  boundOf(startOfMonth(month), endOfMonth(month));

export const startOfWeek = (date: DateOnly): DateOnly =>
  addDays(date, -((((ordinalOf(date) + 3) % 7) + 7) % 7));

const quarterBound = (month: YearMonth): Bound => {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  const first = Math.floor((number - 1) / 3) * 3 + 1;

  return boundOf(
    dateOfText(`${pad(year, 4)}-${pad(first, 2)}-01`),
    endOfMonth(yearMonthOf(`${pad(year, 4)}-${pad(first + 2, 2)}`))
  );
};

const yearBound = (month: YearMonth): Bound => {
  const year = pad(Number(month.slice(0, 4)), 4);

  return boundOf(dateOfText(`${year}-01-01`), dateOfText(`${year}-12-31`));
};

export const resolvePeriod = (choice: PeriodChoice, today: DateOnly): Bound =>
  Match.value(choice).pipe(
    Match.tag("All", () => wholeBook),
    Match.tag("Day", () => boundOf(today, today)),
    Match.tag("Month", () => monthBound(monthOfDate(today))),
    Match.tag("NamedMonth", ({ month }) => monthBound(month)),
    Match.tag("Quarter", () => quarterBound(monthOfDate(today))),
    Match.tag("Week", () => {
      const start = startOfWeek(today);

      return boundOf(start, addDays(start, 6));
    }),
    Match.tag("Year", () => yearBound(monthOfDate(today))),
    Match.exhaustive
  );

export const withinBound = (bound: Bound, date: DateOnly): boolean =>
  Match.value(bound).pipe(
    Match.tag("All", () => true),
    Match.tag("Between", ({ from, to }) => from <= date && date <= to),
    Match.exhaustive
  );

export const daysBetween = (
  from: DateOnly,
  to: DateOnly
): readonly DateOnly[] => {
  const first = ordinalOf(from);
  const last = ordinalOf(to);
  const days: DateOnly[] = [];

  for (let ordinal = first; ordinal <= last; ordinal += 1) {
    days.push(dateOf(ordinal));
  }

  return days;
};

export const daysOfBound = (bound: Bound): readonly DateOnly[] =>
  Match.value(bound).pipe(
    Match.tag("All", () => []),
    Match.tag("Between", ({ from, to }) => daysBetween(from, to)),
    Match.exhaustive
  );

export const monthsBetween = (
  from: YearMonth,
  to: YearMonth
): readonly YearMonth[] => {
  const months: YearMonth[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const lastYear = Number(to.slice(0, 4));
  const lastMonth = Number(to.slice(5, 7));

  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(yearMonthOf(`${pad(year, 4)}-${pad(month, 2)}`));
    month += 1;

    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
};

export const monthsOfBound = (bound: Bound): readonly YearMonth[] =>
  Match.value(bound).pipe(
    Match.tag("All", () => []),
    Match.tag("Between", ({ from, to }) =>
      monthsBetween(monthOfDate(from), monthOfDate(to))
    ),
    Match.exhaustive
  );

export const dayCountOf = (bound: Bound): number =>
  Match.value(bound).pipe(
    Match.tag("All", () => 0),
    Match.tag("Between", ({ from, to }) => ordinalOf(to) - ordinalOf(from) + 1),
    Match.exhaustive
  );
