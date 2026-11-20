import { describe, expect, it } from "@effect/vitest";

import { minorUnits, totalMinor } from "../src/client/pecunia/money.js";
import type { CurrencyCode, Minor } from "../src/client/pecunia/money.js";
import {
  shareOfLargest,
  trendGeometry,
  trendViewBox,
} from "../src/features/pecunia/chart.js";
import { formatMinor } from "../src/features/pecunia/money-format.js";

const cases = 600;

const seed = 24_052_405;

const inset = 4;

const bottom = trendViewBox.height - inset;

const random = (start: number) => {
  let state = start;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };
};

const integerBetween =
  (next: () => number) =>
  (minimum: number, maximum: number): number =>
    minimum + Math.floor(next() * (maximum - minimum + 1));

const currencies: readonly CurrencyCode[] = ["EUR", "GBP", "USD"];

const symbolOf = { EUR: "€", GBP: "£", USD: "$" } satisfies Readonly<
  Record<CurrencyCode, string>
>;

const pattern = /^-?[£€$](?:\d{1,3})(?:,\d{3})*\.\d{2}$/u;

const digitsOf = (formatted: string): string =>
  formatted.replaceAll(/[^0-9]/gu, "");

const exactDigitsOf = (amount: number): string =>
  `${Math.trunc(Math.abs(amount) / 100)}${String(Math.abs(amount) % 100).padStart(2, "0")}`;

const pointsOf = (points: string) =>
  points.split(" ").map((pair) => pair.split(",").map(Number));

const seriesOf = (values: readonly Minor[]): [Minor, ...Minor[]] => {
  const head = values.at(0);

  if (head === undefined) {
    throw new Error("A trend series needs at least one amount");
  }

  return [head, ...values.slice(1)];
};

const generated = () => {
  const next = random(seed);
  const between = integerBetween(next);

  const amounts = Array.from({ length: between(1, 8) }, () =>
    minorUnits(between(0, 1_000_000_000))
  );

  return {
    amounts,
    largest: minorUnits(Math.max(...amounts)),
    values: Array.from({ length: between(2, 24) }, () =>
      minorUnits(between(-1_000_000_000, 1_000_000_000))
    ),
  };
};

describe("formatMinor", () => {
  it("writes any amount as a currency with two exact minor digits", () => {
    const next = random(seed);
    const between = integerBetween(next);

    for (let index = 0; index < cases; index += 1) {
      const amount = minorUnits(between(-1_000_000_000_000, 1_000_000_000_000));
      const currency = currencies[index % currencies.length] ?? "GBP";
      const formatted = formatMinor(amount, currency);

      expect(formatted).toMatch(pattern);
      expect(digitsOf(formatted)).toBe(exactDigitsOf(amount));
      expect(formatted.startsWith("-")).toBe(amount < 0);
      expect(formatted).toContain(symbolOf[currency]);
    }
  });

  it("formats a negated amount as the same string with a sign in front", () => {
    const next = random(seed + 1);
    const between = integerBetween(next);

    for (let index = 0; index < cases; index += 1) {
      const amount = minorUnits(between(1, 1_000_000_000));
      const currency = currencies[index % currencies.length] ?? "GBP";

      expect(formatMinor(minorUnits(0 - amount), currency)).toBe(
        `-${formatMinor(amount, currency)}`
      );
    }
  });

  it("never writes a negative zero", () => {
    for (const currency of currencies) {
      expect(formatMinor(minorUnits(0), currency)).toBe(
        `${symbolOf[currency]}0.00`
      );
    }
  });

  it("writes a currency with no minor digits without a fraction", () => {
    expect(formatMinor(minorUnits(1500), "JPY")).toBe("JPY 1,500");

    expect(formatMinor(0, "JPY")).toBe("JPY 0");

    expect(formatMinor(minorUnits(-1500), "JPY")).toBe("-JPY 1,500");
  });

  it("writes a currency with three minor digits with three", () => {
    expect(formatMinor(minorUnits(1500), "KWD")).toBe("KWD 1.500");

    expect(formatMinor(minorUnits(1), "KWD")).toBe("KWD 0.001");
  });

  it("keeps two minor digits for the demo currencies", () => {
    expect(formatMinor(minorUnits(1500), "EUR")).toBe("€15.00");

    expect(formatMinor(minorUnits(1), "GBP")).toBe("£0.01");

    expect(formatMinor(minorUnits(788_640_000), "EUR")).toBe("€7,886,400.00");
  });
});

describe("totalMinor", () => {
  it("adds any list of amounts to the exact integer total", () => {
    for (let index = 0; index < cases; index += 1) {
      const { amounts } = generated();
      const exact = amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);

      expect(BigInt(totalMinor(amounts))).toBe(exact);
      expect(totalMinor(amounts)).toBe(totalMinor(amounts.toReversed()));
    }

    expect(totalMinor([])).toBe(0);
  });
});

describe("shareOfLargest", () => {
  it("keeps any bar inside the track and never shrinks as the amount grows", () => {
    const next = random(seed + 2);
    const between = integerBetween(next);

    for (let index = 0; index < cases; index += 1) {
      const small = minorUnits(between(0, 500_000_000));
      const large = minorUnits(between(small, 1_000_000_000));
      const largest = minorUnits(between(1, 1_000_000_000));

      expect(shareOfLargest(small, largest)).toBeGreaterThanOrEqual(0);
      expect(shareOfLargest(small, largest)).toBeLessThanOrEqual(1);
      expect(shareOfLargest(small, largest)).toBeLessThanOrEqual(
        shareOfLargest(large, largest)
      );
    }

    expect(shareOfLargest(minorUnits(0), minorUnits(10))).toBe(0);
    expect(shareOfLargest(minorUnits(10), minorUnits(10))).toBe(1);
    expect(shareOfLargest(minorUnits(10), minorUnits(0))).toBe(0);
  });
});

describe("trendGeometry", () => {
  it("draws any series inside the frame with a rising x and a bounded y", () => {
    for (let index = 0; index < cases; index += 1) {
      const { values } = generated();
      const series = seriesOf(values);
      const geometry = trendGeometry(series);
      const points = pointsOf(geometry.points);
      let previousX: number | undefined;

      expect(points).toHaveLength(series.length);
      expect(geometry.area.startsWith(`M ${inset},`)).toBe(true);
      expect(geometry.area.endsWith("Z")).toBe(true);

      for (const [x = Number.NaN, y = Number.NaN] of points) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);

        if (previousX !== undefined) {
          expect(x).toBeGreaterThan(previousX);
        }

        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(trendViewBox.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(trendViewBox.height);

        previousX = x;
      }
    }
  });

  it("puts the largest amount at the top and the smallest at the bottom", () => {
    const next = random(seed + 5);
    const between = integerBetween(next);

    for (let index = 0; index < cases; index += 1) {
      let value = between(0, 1_000_000_000);
      const rising = [minorUnits(value)];

      for (let step = 0; step < between(1, 5); step += 1) {
        value += between(1, 1_000_000);
        rising.push(minorUnits(value));
      }

      const series = seriesOf(rising);
      const points = pointsOf(trendGeometry(series).points);
      const drawn = points.map((pair) => pair[1] ?? Number.NaN);

      expect(Math.min(...drawn)).toBe(inset);
      expect(Math.max(...drawn)).toBe(bottom);

      for (const [position, amount] of series.entries()) {
        const here = drawn[position] ?? Number.NaN;

        for (const [other, otherAmount] of series.entries()) {
          if (amount < otherAmount) {
            expect(here).toBeGreaterThan(drawn[other] ?? Number.NaN);
          }
        }
      }
    }
  });

  it("draws a flat series on one line", () => {
    const flat = trendGeometry([
      minorUnits(500),
      minorUnits(500),
      minorUnits(500),
    ]);

    const drawn = pointsOf(flat.points).map((pair) => pair[1] ?? Number.NaN);

    expect(new Set(drawn).size).toBe(1);
    expect(Number.isFinite(drawn[0] ?? Number.NaN)).toBe(true);
  });
});
