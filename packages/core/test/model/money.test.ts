import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import { ConversionOverflow } from "../../src/model/conversion-overflow.js";
import {
  CurrencyMismatch,
  RateUnavailable,
  addMoney,
  convert,
  convertMinor,
  subtractMoney,
} from "../../src/model/money.js";
import type { RateLookup } from "../../src/model/money.js";
import type { CurrencyCode } from "../../src/model/primitives.js";
import { CurrencyCodeSchema, MoneySchema } from "../../src/model/primitives.js";
import { RateSchema } from "../../src/model/rate.js";

const minorRange = Schema.Int.check(
  Schema.isBetween({ maximum: 1_000_000_000, minimum: -1_000_000_000 })
);

const rateDigits = Schema.Int.check(
  Schema.isBetween({ maximum: 1_000_000, minimum: 1 })
);

const rateScale = Schema.Int.check(
  Schema.isBetween({ maximum: 12, minimum: 0 })
);

const currencies = Arbitrary.schema(CurrencyCodeSchema);

const otherThanEuro = Arbitrary.filter((currency) => currency !== "EUR")(
  currencies
);

const currencyOf = (code: string): CurrencyCode =>
  Schema.decodeSync(CurrencyCodeSchema)(code);

const moneyOf = (code: string, minor: number) =>
  Schema.decodeSync(MoneySchema)({ currency: code, minor });

const euro = (minor: number) => moneyOf("EUR", minor);

const rateOf = (text: string) => Schema.decodeSync(RateSchema)(text);

const rateLookup =
  (text: string): RateLookup =>
  () =>
    Option.some(rateOf(text));

const convertedMinor = (
  minor: number,
  from: string,
  to: string,
  rate: string
) =>
  Effect.map(
    convert(moneyOf(from, minor), currencyOf(to), rateLookup(rate)),
    (base) => base.minor
  );

const decimalText = (digits: number, scale: number): string => {
  const padded = String(digits).padStart(scale + 1, "0");
  const cut = padded.length - scale;
  const whole = padded.slice(0, cut);
  const fraction = padded.slice(cut);

  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
};

const exactParts = (text: string) => {
  const [whole = "", fraction = ""] = text.split(".");

  return {
    denominator: 10n ** BigInt(fraction.length),
    numerator: BigInt(`${whole}${fraction}`),
  };
};

const roundHalfAwayFromZero = (numerator: bigint, denominator: bigint) => {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = (remainder < 0n ? -remainder : remainder) * 2n;
  const step = numerator < 0n ? -1n : 1n;

  return doubled >= denominator ? quotient + step : quotient;
};

describe("money arithmetic", () => {
  it.effect.prop(
    "addition keeps every minor unit and subtraction restores the left amount",
    {
      currency: currencies,
      left: Arbitrary.schema(minorRange),
      right: Arbitrary.schema(minorRange),
    },
    ({ currency, left, right }) =>
      Effect.gen(function* moneyStaysExact() {
        const sum = yield* addMoney(
          moneyOf(currency, left),
          moneyOf(currency, right)
        );

        expect(sum).toStrictEqual(moneyOf(currency, left + right));

        const difference = yield* subtractMoney(sum, moneyOf(currency, right));

        expect(difference).toStrictEqual(moneyOf(currency, left));
      })
  );

  it.effect.prop(
    "cross-currency addition always fails with CurrencyMismatch",
    {
      amount: Arbitrary.schema(minorRange),
      currency: otherThanEuro,
    },
    ({ amount, currency }) =>
      Effect.gen(function* currenciesNeverMix() {
        const failure = yield* Effect.flip(
          addMoney(euro(amount), moneyOf(currency, amount))
        );

        expect(failure).toStrictEqual(
          new CurrencyMismatch({ left: euro(0).currency, right: currency })
        );

        const subtractionFailure = yield* Effect.flip(
          subtractMoney(moneyOf(currency, amount), euro(amount))
        );

        expect(subtractionFailure).toStrictEqual(
          new CurrencyMismatch({ left: currency, right: euro(0).currency })
        );
      })
  );
});

describe("conversion", () => {
  it.effect.prop(
    "a missing rate never becomes a guessed rate",
    { amount: Arbitrary.schema(minorRange), currency: otherThanEuro },
    ({ amount, currency }) =>
      Effect.gen(function* missingRateFails() {
        const failure = yield* Effect.flip(
          convert(moneyOf(currency, amount), euro(0).currency, () =>
            Option.none()
          )
        );

        expect(failure).toStrictEqual(
          new RateUnavailable({ from: currency, to: euro(0).currency })
        );
      })
  );

  it.effect.prop(
    "converting into the same currency is the identity and reads no rate",
    { amount: Arbitrary.schema(minorRange), currency: currencies },
    ({ amount, currency }) =>
      Effect.gen(function* sameCurrencyIsIdentity() {
        const money = moneyOf(currency, amount);

        const base = yield* convert(money, money.currency, () => {
          throw new Error("convert read a rate for a same-currency amount");
        });

        expect(base).toStrictEqual(money);
      })
  );

  it.effect("rounds converted halves away from zero", () =>
    Effect.gen(function* halvesRoundAway() {
      expect(yield* convertedMinor(100, "USD", "GBP", "1.005")).toBe(101);
      expect(yield* convertedMinor(-100, "USD", "GBP", "1.005")).toBe(-101);
      expect(yield* convertedMinor(1, "USD", "GBP", "0.5")).toBe(1);
      expect(yield* convertedMinor(-1, "USD", "GBP", "0.5")).toBe(-1);
      expect(yield* convertedMinor(3, "USD", "GBP", "0.3333")).toBe(1);
      expect(yield* convertedMinor(3, "USD", "GBP", "0.5")).toBe(2);
      expect(yield* convertedMinor(-3, "USD", "GBP", "0.5")).toBe(-2);
      expect(yield* convertedMinor(1, "USD", "GBP", "0.4")).toBe(0);
    })
  );

  it.effect("fails with ConversionOverflow instead of losing precision", () =>
    Effect.gen(function* overflowFails() {
      const large = moneyOf("USD", Number.MAX_SAFE_INTEGER);

      const failure = yield* Effect.flip(
        convert(large, currencyOf("GBP"), rateLookup("2"))
      );

      expect(failure).toStrictEqual(
        new ConversionOverflow({
          baseCurrency: currencyOf("GBP"),
          currency: currencyOf("USD"),
          minor: large.minor,
          rate: rateOf("2"),
        })
      );
    })
  );

  it.prop(
    "converted minor units match an exact decimal product rounded half away from zero",
    {
      amount: Arbitrary.schema(minorRange),
      digits: Arbitrary.schema(rateDigits),
      scale: Arbitrary.schema(rateScale),
    },
    ({ amount, digits, scale }) => {
      const text = decimalText(digits, scale);
      const { denominator, numerator } = exactParts(text);

      const expected = roundHalfAwayFromZero(
        BigInt(amount) * numerator,
        denominator
      );

      expect(
        Option.getOrThrow(
          convertMinor(
            amount,
            currencyOf("USD"),
            currencyOf("GBP"),
            rateOf(text)
          )
        )
      ).toBe(Number(expected));
    },
    { arbitrary: { runs: 200 } }
  );
});
