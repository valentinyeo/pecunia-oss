import { expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  civilDateOfDayNumber,
  dayNumberOf,
  daysBetween,
  formatCivil,
  isCalendarDate,
  shiftDays,
  shiftMonths,
} from "../src/civil.js";
import { DateOnlySchema, FREQUENCIES } from "../src/model.js";
import { nextChargeOn, FREQUENCY_BANDS } from "../src/schedule.js";

const CASES = 700;

interface Random {
  readonly int: (min: number, max: number) => number;
}

const makeRandom = (seed: number): Random => {
  let state = seed % 4_294_967_296;

  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };

  return { int: (min, max) => min + Math.floor(next() * (max - min + 1)) };
};

const pad = (value: number, width: number) => `${value}`.padStart(width, "0");

const dateOnly = Schema.decodeSync(DateOnlySchema);

const monthLengthOf = (year: number, month: number): number => {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

  return month === 2 && leap ? 29 : (lengths[month - 1] ?? 0);
};

it("keeps the reference calendar dates the arithmetic leans on", () => {
  expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
  expect(daysBetween("2023-02-28", "2023-03-01")).toBe(1);
  expect(daysBetween("2000-01-01", "2000-12-31")).toBe(365);
  expect(daysBetween("1900-01-01", "1901-01-01")).toBe(365);
  expect(daysBetween("2025-01-01", "2026-01-01")).toBe(365);
  expect(daysBetween("2024-01-01", "2025-01-01")).toBe(366);
  expect(shiftMonths("2025-01-31", 1)).toBe("2025-02-28");
  expect(shiftMonths("2024-01-31", 1)).toBe("2024-02-29");
  expect(shiftMonths("2024-03-31", -1)).toBe("2024-02-29");
  expect(shiftDays("2024-12-31", 1)).toBe("2025-01-01");
  expect(isCalendarDate("2025-02-30")).toBe(false);
  expect(isCalendarDate("2025-13-01")).toBe(false);
  expect(isCalendarDate("2025-00-10")).toBe(false);
  expect(isCalendarDate("2025-04-31")).toBe(false);
});

it("round trips every generated date through its day number", () => {
  const random = makeRandom(0x5e_e1_c1_11);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const year = random.int(1900, 2100);
    const month = random.int(1, 12);
    const day = random.int(1, monthLengthOf(year, month));
    const text = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;

    expect(isCalendarDate(text)).toBe(true);
    expect(formatCivil(civilDateOfDayNumber(dayNumberOf(text)))).toBe(text);

    checked += 1;
  }

  expect(checked).toBe(CASES);
});

it("shifts by a day count that adds up exactly", () => {
  const random = makeRandom(0x5e_e1_c1_12);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const year = random.int(1900, 2100);
    const month = random.int(1, 12);
    const day = random.int(1, monthLengthOf(year, month));
    const text = dateOnly(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
    const days = random.int(-400, 400);
    const shifted = dateOnly(shiftDays(text, days));

    expect(isCalendarDate(shifted)).toBe(true);
    expect(daysBetween(text, shifted)).toBe(days);
    expect(
      dayNumberOf(formatCivil(civilDateOfDayNumber(dayNumberOf(shifted))))
    ).toBe(dayNumberOf(shifted));

    checked += 1;
  }

  expect(checked).toBe(CASES);
});

it("shifts whole months inside the month that lands", () => {
  const random = makeRandom(0x5e_e1_c1_13);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const year = random.int(1900, 2100);
    const month = random.int(1, 12);
    const day = random.int(1, monthLengthOf(year, month));
    const text = dateOnly(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
    const months = random.int(-60, 60);
    const shifted = dateOnly(shiftMonths(text, months));
    const index0 = month - 1 + months;
    const landedYear = year + Math.floor(index0 / 12);
    const landedMonth = (((index0 % 12) + 12) % 12) + 1;
    const landedDay = Math.min(day, monthLengthOf(landedYear, landedMonth));

    expect(isCalendarDate(shifted)).toBe(true);
    expect(shifted).toBe(
      `${pad(landedYear, 4)}-${pad(landedMonth, 2)}-${pad(landedDay, 2)}`
    );

    checked += 1;
  }

  expect(checked).toBe(CASES);
});

it("puts the next charge inside the band of its frequency", () => {
  const random = makeRandom(0x5e_e1_c1_14);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const year = random.int(1900, 2100);
    const month = random.int(1, 12);
    const day = random.int(1, monthLengthOf(year, month));
    const last = dateOnly(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);

    const frequency =
      FREQUENCIES[random.int(0, FREQUENCIES.length - 1)] ?? "weekly";

    const next = nextChargeOn(last, frequency);
    const gap = daysBetween(last, next);
    const band = FREQUENCY_BANDS[frequency];

    expect(isCalendarDate(next)).toBe(true);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeGreaterThanOrEqual(band.min);
    expect(gap).toBeLessThanOrEqual(band.max);

    checked += 1;
  }

  expect(checked).toBe(CASES);
});
