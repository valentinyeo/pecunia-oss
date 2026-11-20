import { BankLineSchema } from "@pecunia/bank-lines";
import type {
  DateOnly,
  OccurredRange,
  TimestampMillis,
} from "@pecunia/bank-lines";
import { DateTime, Option, Schema } from "effect";

const dayText = BankLineSchema.fields.valueDate;

const timestampMillis = BankLineSchema.fields.occurredAt;

const MILLIS_PER_DAY = 86_400_000;

const LAST_MILLIS = 253_402_300_799_999;

const ZERO_MILLIS = Schema.decodeSync(timestampMillis)(0);

const LAST_INSTANT = Schema.decodeSync(timestampMillis)(LAST_MILLIS);

const instantOf = (day: string) => DateTime.make(`${day}T00:00:00.000Z`);

const isRealDay = (day: string) =>
  Option.exists(
    instantOf(day),
    (instant) =>
      DateTime.toEpochMillis(instant) >= 0 &&
      DateTime.formatIsoDateUtc(instant) === day
  );

export const DaySchema = dayText.check(
  Schema.makeFilter(isRealDay, {
    expected: "a real calendar day from 1970-01-01, written YYYY-MM-DD",
  })
);

const epochMillisOf = (day: DateOnly): number =>
  DateTime.toEpochMillis(
    Option.getOrThrowWith(
      instantOf(day),
      () => new Error(`${day} is not a calendar day`)
    )
  );

export const startOfDayMillis = (day: DateOnly): TimestampMillis =>
  Schema.decodeSync(timestampMillis)(epochMillisOf(day));

export const endOfDayMillis = (day: DateOnly): TimestampMillis =>
  Schema.decodeSync(timestampMillis)(epochMillisOf(day) + MILLIS_PER_DAY - 1);

export const occurredRangeOf = (
  from: Option.Option<DateOnly>,
  to: Option.Option<DateOnly>
): Option.Option<OccurredRange> => {
  const start = Option.match(from, {
    onNone: () => ZERO_MILLIS,
    onSome: startOfDayMillis,
  });

  const end = Option.match(to, {
    onNone: () => LAST_INSTANT,
    onSome: endOfDayMillis,
  });

  return start <= end ? Option.some({ from: start, to: end }) : Option.none();
};
