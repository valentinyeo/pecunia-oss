import { expect, it } from "@effect/vitest";

import {
  addDays,
  boundOf,
  dateOf,
  dayCountOf,
  daysBetween,
  endOfMonth,
  monthLength,
  monthOfDate,
  monthsBetween,
  ordinalOf,
  resolvePeriod,
  startOfMonth,
  startOfWeek,
  withinBound,
} from "../src/date.js";
import type { PeriodChoice } from "../src/model.js";
import { PeriodChoiceSchema } from "../src/model.js";
import type { dateOf as date } from "./fixtures.js";
import { CASES, monthOf, seeded } from "./fixtures.js";

const draw = seeded(20_240_315);

const randomDate = (): ReturnType<typeof date> => {
  const ordinal = draw(160_000) - 40_000;

  return dateOf(ordinal);
};

const choiceOf = (
  tag: PeriodChoice["_tag"],
  today: ReturnType<typeof date>
): PeriodChoice => {
  if (tag === "NamedMonth") {
    return PeriodChoiceSchema.cases.NamedMonth.make({
      month: monthOfDate(today),
    });
  }

  return PeriodChoiceSchema.cases[tag].make({});
};

it("every generated ordinal round trips through its date", () => {
  for (let index = 0; index < CASES; index += 1) {
    const ordinal = draw(160_000) - 40_000;

    expect(ordinalOf(dateOf(ordinal))).toBe(ordinal);
  }
});

it("adding days and taking them back leaves the date unchanged", () => {
  for (let index = 0; index < CASES; index += 1) {
    const start = randomDate();
    const days = draw(800) - 400;

    expect(ordinalOf(addDays(addDays(start, days), -days))).toBe(
      ordinalOf(start)
    );
  }
});

it("a resolved period always contains its day, and its length is the period's length", () => {
  for (let index = 0; index < CASES; index += 1) {
    const today = randomDate();
    const month = monthOfDate(today);
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const quarterStart = Math.floor((monthNumber - 1) / 3) * 3 + 1;

    const quarterDays = [0, 1, 2].reduce(
      (total, offset) =>
        total +
        monthLength(
          monthOf(
            `${String(year).padStart(4, "0")}-${String(quarterStart + offset).padStart(2, "0")}`
          )
        ),
      0
    );

    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

    const expected = new Map<PeriodChoice["_tag"], number>([
      ["Day", 1],
      ["Month", monthLength(month)],
      ["NamedMonth", monthLength(month)],
      ["Quarter", quarterDays],
      ["Week", 7],
      ["Year", leap ? 366 : 365],
    ]);

    for (const [tag, days] of expected) {
      const bound = resolvePeriod(choiceOf(tag, today), today);

      expect(withinBound(bound, today)).toBe(true);
      expect(dayCountOf(bound)).toBe(days);
    }
  }
});

it("a week starts on Monday and covers seven days", () => {
  for (let index = 0; index < CASES; index += 1) {
    const today = randomDate();
    const start = startOfWeek(today);

    expect((((ordinalOf(start) + 3) % 7) + 7) % 7).toBe(0);
    expect(ordinalOf(start) <= ordinalOf(today)).toBe(true);
    expect(ordinalOf(today) - ordinalOf(start) <= 6).toBe(true);
  }
});

it("a range lists exactly the days it counts, in order", () => {
  for (let index = 0; index < CASES; index += 1) {
    const from = randomDate();
    const to = addDays(from, draw(120));
    const days = daysBetween(from, to);

    expect(days.length).toBe(dayCountOf(boundOf(from, to)));
    expect(days[0]).toBe(from);
    expect(days.at(-1)).toBe(to);

    for (const day of days) {
      expect(withinBound(boundOf(from, to), day)).toBe(true);
    }
  }
});

it("a month reports the days the calendar holds, leap years included", () => {
  expect(monthLength(monthOf("2024-02"))).toBe(29);
  expect(monthLength(monthOf("2023-02"))).toBe(28);
  expect(monthLength(monthOf("1900-02"))).toBe(28);
  expect(monthLength(monthOf("2000-02"))).toBe(29);
  expect(startOfMonth(monthOf("2024-02"))).toBe("2024-02-01");
  expect(endOfMonth(monthOf("2024-02"))).toBe("2024-02-29");
});

it("months are listed once each, in calendar order", () => {
  const months = monthsBetween(monthOf("2023-11"), monthOf("2024-03"));

  expect(months).toStrictEqual([
    "2023-11",
    "2023-12",
    "2024-01",
    "2024-02",
    "2024-03",
  ]);
});
