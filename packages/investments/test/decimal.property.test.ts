import { Option, Schema } from "effect";
import { expect, it } from "vitest";

import { decimalUnits, moneyOfText, quantityOfText } from "../src/decimal.js";
import { CurrencyCodeSchema } from "../src/model.js";

const SEED = 987_654_321;

const CASES = 500;

const MODULUS = 2_147_483_647;

const MULTIPLIER = 48_271;

const seeded = (seed: number) => {
  let state = seed % MODULUS;

  if (state <= 0) {
    state += MODULUS - 1;
  }

  return () => {
    state = (state * MULTIPLIER) % MODULUS;

    return (state - 1) / (MODULUS - 1);
  };
};

const next = seeded(SEED);

const intBetween = (min: number, max: number) =>
  min + Math.floor(next() * (max - min + 1));

const digits = (length: number): string =>
  Array.from({ length }, () => String(intBetween(0, 9))).join("");

it("reads a decimal string into exact units over 500 seeded cases", () => {
  for (let index = 0; index < CASES; index += 1) {
    const whole = digits(intBetween(1, 9));

    const fraction = digits(intBetween(0, 6));

    const text = fraction.length === 0 ? whole : `${whole}.${fraction}`;

    const units = decimalUnits(text, 6);

    expect(units._tag).toBe("Some");

    expect(Option.getOrNull(units)).toBe(
      BigInt(`${whole}${fraction.padEnd(6, "0")}`)
    );

    const quantity = quantityOfText(text);

    expect(quantity._tag).toBe("Some");

    expect(Option.getOrNull(quantity)).toBe(
      Number(BigInt(`${whole}${fraction.padEnd(6, "0")}`))
    );
  }
});

it("refuses a fraction longer than the unit count holds", () => {
  expect(decimalUnits("1.1234567", 6)._tag).toBe("None");

  expect(quantityOfText("1.1234567")._tag).toBe("None");

  expect(
    moneyOfText("1.005", Schema.decodeSync(CurrencyCodeSchema)("EUR"))._tag
  ).toBe("None");
});

it("gives a currency with no minor units no fraction at all", () => {
  const yen = Schema.decodeSync(CurrencyCodeSchema)("JPY");

  expect(moneyOfText("1500", yen)._tag).toBe("Some");

  expect(moneyOfText("1500.5", yen)._tag).toBe("None");

  expect(decimalUnits("0.5", 0)._tag).toBe("None");
});

it("never loses a minor unit to floating point", () => {
  const eur = Schema.decodeSync(CurrencyCodeSchema)("EUR");

  const amount = moneyOfText("0.29", eur);

  expect(amount._tag).toBe("Some");

  expect(Option.getOrNull(amount)?.minor).toBe(29);

  expect(Number.isInteger(Option.getOrNull(amount)?.minor)).toBe(true);
});
