import { describe, expect, it } from "@effect/vitest";
import { Option, Schema } from "effect";

import {
  DaySchema,
  endOfDayMillis,
  occurredRangeOf,
  startOfDayMillis,
} from "../src/day.js";

const MILLIS_PER_DAY = 86_400_000;

const CASES = 650;

interface Random {
  readonly next: () => number;
}

const MODULUS = 4_294_967_296;

const seeded = (seed: number): Random => {
  let state = seed % MODULUS;

  return {
    next: () => {
      state = (state * 1_664_525 + 1_013_904_223) % MODULUS;

      return state / MODULUS;
    },
  };
};

const between = (random: Random, minimum: number, maximum: number): number =>
  minimum + Math.floor(random.next() * (maximum - minimum + 1));

const padded = (value: number): string => String(value).padStart(2, "0");

const textOf = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${padded(month)}-${padded(day)}`;

const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const daysInMonth = (year: number, month: number): number => {
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return monthLengths[month - 1] ?? 0;
};

const isRealDay = (year: number, month: number, day: number): boolean =>
  month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);

const daysFromCivil = (year: number, month: number, day: number): number => {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const monthOfYear = (month + 9) % 12;
  const dayOfYear = Math.floor((153 * monthOfYear + 2) / 5) + day - 1;

  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;

  return era * 146_097 + dayOfEra - 719_468;
};

const civilFromDays = (days: number): readonly [number, number, number] => {
  const shifted = days + 719_468;
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

  const monthOfYear = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthOfYear + 2) / 5) + 1;
  const month = monthOfYear < 10 ? monthOfYear + 3 : monthOfYear - 9;
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);

  return [year, month, day];
};

const decodeDay = (text: string) => Schema.decodeOption(DaySchema)(text);

const dayOf = (text: string) => {
  const decoded = decodeDay(text);

  if (Option.isNone(decoded)) {
    throw new Error(`${text} should be a calendar day`);
  }

  return decoded.value;
};

describe("the day boundary", () => {
  it("accepts exactly the real calendar days from 1970", () => {
    const random = seeded(19_701);

    for (let index = 0; index < CASES; index += 1) {
      const year = between(random, 1960, 2100);
      const month = between(random, 0, 13);
      const day = between(random, 0, 32);
      const text = textOf(year, month, day);

      const expected = year >= 1970 && isRealDay(year, month, day);

      expect(
        Option.isSome(decodeDay(text)),
        `${text} should be ${expected ? "accepted" : "refused"}`
      ).toBe(expected);
    }
  });

  it("puts each day's start on its own day index", () => {
    const random = seeded(19_702);

    for (let index = 0; index < CASES; index += 1) {
      const year = between(random, 1970, 2100);
      const month = between(random, 1, 12);
      const day = between(random, 1, daysInMonth(year, month));

      const start = startOfDayMillis(dayOf(textOf(year, month, day)));

      expect(start, `${textOf(year, month, day)} starts at its day index`).toBe(
        daysFromCivil(year, month, day) * MILLIS_PER_DAY
      );

      expect(
        Number(endOfDayMillis(dayOf(textOf(year, month, day)))) - start,
        "a day ends 86 399 999 milliseconds after it starts"
      ).toBe(MILLIS_PER_DAY - 1);
    }
  });

  it("covers exactly the days a range names", () => {
    const random = seeded(19_703);

    for (let index = 0; index < CASES; index += 1) {
      const first = between(
        random,
        daysFromCivil(1970, 1, 1),
        daysFromCivil(2100, 12, 31)
      );

      const span = between(random, 0, 30);

      const last = first + span;

      const [fromYear, fromMonth, fromDay] = civilFromDays(first);
      const [toYear, toMonth, toDay] = civilFromDays(last);

      const from = dayOf(textOf(fromYear, fromMonth, fromDay));
      const to = dayOf(textOf(toYear, toMonth, toDay));

      const range = occurredRangeOf(Option.some(from), Option.some(to));

      if (Option.isNone(range)) {
        throw new Error("A forward range should exist");
      }

      expect(range.value.from).toBe(first * MILLIS_PER_DAY);
      expect(range.value.to).toBe(last * MILLIS_PER_DAY + MILLIS_PER_DAY - 1);

      const before = startOfDayMillis(from) - 1;
      const after = endOfDayMillis(to) + 1;

      expect(before).toBeLessThan(range.value.from);
      expect(after).toBeGreaterThan(range.value.to);
    }
  });

  it("leaves an open end open on the side it does not name", () => {
    const random = seeded(19_704);

    for (let index = 0; index < CASES; index += 1) {
      const year = between(random, 1970, 2100);
      const month = between(random, 1, 12);
      const day = between(random, 1, daysInMonth(year, month));
      const text = textOf(year, month, day);

      const onlyFrom = occurredRangeOf(Option.some(dayOf(text)), Option.none());
      const onlyTo = occurredRangeOf(Option.none(), Option.some(dayOf(text)));

      if (Option.isNone(onlyFrom) || Option.isNone(onlyTo)) {
        throw new Error("An open range should exist");
      }

      expect(onlyFrom.value.from).toBe(startOfDayMillis(dayOf(text)));
      expect(onlyFrom.value.to).toBeGreaterThanOrEqual(
        endOfDayMillis(dayOf(text))
      );
      expect(onlyTo.value.from).toBeLessThanOrEqual(
        startOfDayMillis(dayOf(text))
      );
      expect(onlyTo.value.to).toBe(endOfDayMillis(dayOf(text)));
    }
  });

  it("refuses a range whose start is later than its end", () => {
    const random = seeded(19_705);

    for (let index = 0; index < CASES; index += 1) {
      const year = between(random, 1970, 2100);
      const month = between(random, 1, 12);
      const day = between(random, 1, daysInMonth(year, month));
      const later = daysFromCivil(year, month, day) + between(random, 1, 400);
      const [laterYear, laterMonth, laterDay] = civilFromDays(later);

      const backwards = occurredRangeOf(
        Option.some(dayOf(textOf(laterYear, laterMonth, laterDay))),
        Option.some(dayOf(textOf(year, month, day)))
      );

      expect(Option.isNone(backwards)).toBe(true);
    }
  });
});
