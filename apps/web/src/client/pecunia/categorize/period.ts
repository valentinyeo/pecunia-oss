import { DateTime, Schema } from "effect";

import { TimestampMillisSchema } from "./ids.js";
import type { TimestampMillis } from "./ids.js";

const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;

const monthBeyondTheEpoch = Schema.makeFilter(
  (month: string) => Number(month.slice(0, 4)) >= 1970,
  { expected: "a month from 1970 on" }
);

export const MonthSchema = Schema.String.check(
  Schema.isPattern(MONTH_PATTERN),
  monthBeyondTheEpoch
).pipe(Schema.brand("Month"));

export type Month = typeof MonthSchema.Type;

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const pad = (value: number, width: number): string =>
  String(value).padStart(width, "0");

const decodeMillis = (value: number): TimestampMillis =>
  Schema.decodeSync(TimestampMillisSchema)(value);

const decodeMonth = (year: number, monthNumber: number): Month =>
  Schema.decodeSync(MonthSchema)(`${pad(year, 4)}-${pad(monthNumber, 2)}`);

const yearOf = (month: Month): number => Number(month.slice(0, 4));

const monthNumberOf = (month: Month): number => Number(month.slice(5, 7));

const millisAtUtc = (
  year: number,
  monthNumber: number,
  day: number,
  hour: number
): TimestampMillis =>
  decodeMillis(
    DateTime.toEpochMillis(
      DateTime.makeUnsafe(
        `${pad(year, 4)}-${pad(monthNumber, 2)}-${pad(day, 2)}T${pad(hour, 2)}:00:00.000Z`
      )
    )
  );

export const millisOfDay = (month: Month, day: number, hour: number) =>
  millisAtUtc(yearOf(month), monthNumberOf(month), day, hour);

export const monthOfMillis = (millis: TimestampMillis): Month => {
  const parts = DateTime.toPartsUtc(DateTime.makeUnsafe(millis));

  return decodeMonth(parts.year, parts.month);
};

export const startOfMonth = (month: Month): TimestampMillis =>
  millisAtUtc(yearOf(month), monthNumberOf(month), 1, 0);

export const endOfMonth = (month: Month): TimestampMillis =>
  decodeMillis(startOfMonth(addMonths(month, 1)) - 1);

export const addMonths = (month: Month, count: number): Month => {
  const index = yearOf(month) * 12 + (monthNumberOf(month) - 1) + count;

  return decodeMonth(Math.floor(index / 12), (index % 12) + 1);
};

export const monthLabel = (month: Month): string =>
  `${MONTH_NAMES[monthNumberOf(month) - 1]} ${yearOf(month)}`;

export const monthsEndingAt = (month: Month, count: number): readonly Month[] =>
  Array.from({ length: count }, (_, index) =>
    addMonths(month, index - count + 1)
  );

export const dayLabel = (millis: TimestampMillis): string => {
  const parts = DateTime.toPartsUtc(DateTime.makeUnsafe(millis));

  return `${parts.day} ${monthLabel(decodeMonth(parts.year, parts.month))}`;
};
