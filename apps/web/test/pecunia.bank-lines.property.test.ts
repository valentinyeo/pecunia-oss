import { expect, it } from "@effect/vitest";
import { DateOnlySchema } from "@pecunia/bank-lines/model";
import { Schema } from "effect";

import { formatDay } from "../src/features/pecunia/day-format.js";
import { formatMoney } from "../src/features/pecunia/money-format.js";

const CASES = 600;

const seeded = (salt: number) => {
  let state = 20_260_214 + salt;

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state;
  };
};

const currencies = ["EUR", "GBP", "USD", "CHF", "JPY", "SEK"] as const;

const symbolFor = (currency: string): string => {
  if (currency === "EUR") {
    return "€";
  }

  if (currency === "GBP") {
    return "£";
  }

  return currency === "USD" ? "$" : `${currency} `;
};

const referenceMoney = (minor: number, currency: string): string => {
  const absolute = Math.abs(minor);
  const major = String(Math.floor(absolute / 100));
  const cents = String(absolute % 100).padStart(2, "0");
  const groups: string[] = [];

  let rest = major;

  while (rest.length > 3) {
    groups.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }

  groups.unshift(rest);

  return `${minor < 0 ? "-" : ""}${symbolFor(currency)}${groups.join(",")}.${cents}`;
};

const monthNames: readonly string[] = [
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
];

const civilFromDays = (days: number) => {
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

  const year = yearOfEra + era * 400;

  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));

  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth + (shiftedMonth < 10 ? 3 : -9);

  return { day, month, year: year + (month <= 2 ? 1 : 0) };
};

const padded = (value: number, width: number): string =>
  String(value).padStart(width, "0");

const dateOnlyOf = (days: number) => {
  const { day, month, year } = civilFromDays(days);

  return Schema.decodeSync(DateOnlySchema)(
    `${padded(year, 4)}-${padded(month, 2)}-${padded(day, 2)}`
  );
};

it("formats every generated amount exactly as the reference does", () => {
  const random = seeded(1);

  for (let index = 0; index < CASES; index += 1) {
    const magnitude = random() % 99_999_999;
    const minor = index % 3 === 0 ? magnitude * -1 : magnitude;
    const currency = currencies[random() % currencies.length] ?? "EUR";

    expect(formatMoney({ currency, minor })).toBe(
      referenceMoney(minor, currency)
    );
  }
});

it("keeps one separator every three major digits and two decimal places", () => {
  const random = seeded(2);

  for (let index = 0; index < CASES; index += 1) {
    const minor = random() % 10_000_000_000;
    const currency = currencies[index % currencies.length] ?? "EUR";
    const shown = formatMoney({ currency, minor });
    const numeric = shown.replace(/^[-+]?(?:[A-Z]{3} |[€£$])/u, "");
    const [major = "", cents = ""] = numeric.split(".");

    expect(cents).toHaveLength(2);
    expect(major).toMatch(/^\d{1,3}(?:,\d{3})*$/u);
  }
});

it("never loses the sign of a negative amount", () => {
  const random = seeded(3);

  for (let index = 0; index < CASES; index += 1) {
    const minor = (random() % 1_000_000) * -1 - 1;
    const currency = currencies[index % currencies.length] ?? "EUR";

    expect(formatMoney({ currency, minor })).toContain("-");
    expect(formatMoney({ currency, minor: Math.abs(minor) })).not.toContain(
      "-"
    );
  }
});

it("formats every generated calendar date as day, month and year", () => {
  const random = seeded(4);

  for (let index = 0; index < CASES; index += 1) {
    const days = random() % 73_049;
    const valueDate = dateOnlyOf(days);
    const { day, month, year } = civilFromDays(days);
    const monthName = monthNames[month - 1];

    expect(formatDay(valueDate)).toBe(`${day} ${monthName} ${year}`);
  }
});

it("keeps a date it cannot place on the calendar as it arrived", () => {
  expect(formatDay(Schema.decodeSync(DateOnlySchema)("2025-13-40"))).toBe(
    "2025-13-40"
  );
  expect(formatDay(Schema.decodeSync(DateOnlySchema)("2025-00-01"))).toBe(
    "2025-00-01"
  );
});
