import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  CurrencyMismatch,
  RateUnavailable,
  addMoney,
  convert,
  subtractMoney,
} from "../../src/model/money.js";
import type { RateLookup } from "../../src/model/money.js";
import {
  BaseAmountSchema,
  CurrencyCodeSchema,
  MoneySchema,
  RateSchema,
} from "../../src/model/primitives.js";

const minorRange = Schema.Int.check(
  Schema.isBetween({ maximum: 1_000_000_000, minimum: -1_000_000_000 })
);

const rateRange = Schema.Finite.check(
  Schema.isBetween({ maximum: 1000, minimum: 0.01 })
);

const currencies = Arbitrary.schema(CurrencyCodeSchema);

const otherThanEuro = Arbitrary.filter((currency) => currency !== "EUR")(
  currencies
);

const moneyOf = (currency: string, minor: number) =>
  Schema.decodeSync(MoneySchema)({ currency, minor });

const euro = (minor: number) => moneyOf("EUR", minor);

const sterling = Schema.decodeSync(CurrencyCodeSchema)("GBP");

const baseAmountOf = (minor: number) =>
  Schema.decodeSync(BaseAmountSchema)({ currency: "GBP", minor });

const convertToSterling = (minor: number, rate: number) =>
  convert(euro(minor), sterling, rateLookup(rate));

const rateLookup =
  (rate: number): RateLookup =>
  () =>
    Option.some(Schema.decodeSync(RateSchema)(rate));

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
      expect(yield* convertToSterling(1, 0.5)).toStrictEqual(baseAmountOf(1));
      expect(yield* convertToSterling(3, 0.5)).toStrictEqual(baseAmountOf(2));
      expect(yield* convertToSterling(-1, 0.5)).toStrictEqual(baseAmountOf(-1));
      expect(yield* convertToSterling(1, 0.4)).toStrictEqual(baseAmountOf(0));
    })
  );

  it.effect.prop(
    "rounding stays within half a minor unit of the exact product",
    {
      amount: Arbitrary.schema(minorRange),
      rate: Arbitrary.schema(rateRange),
    },
    ({ amount, rate }) =>
      Effect.gen(function* roundingIsBounded() {
        const base = yield* convert(euro(amount), sterling, rateLookup(rate));

        expect(Math.abs(base.minor - amount * rate)).toBeLessThanOrEqual(
          0.5 + Number.EPSILON
        );
      })
  );
});
