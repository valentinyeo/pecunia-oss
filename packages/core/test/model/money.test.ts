import { describe, expect, it } from "@effect/vitest";
import { Effect, Option, Result, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";

import {
  conversionInputInvalid,
  conversionOverflow,
  currencyMismatch,
  moneyOverflow,
  rateUnavailable,
} from "../../src/model/errors.js";
import {
  AmountsSchema,
  BaseAmount,
  addMoney,
  convert,
  convertMinor,
  minorUnitExponent,
  subtractMoney,
} from "../../src/model/money.js";
import type { RateLookup } from "../../src/model/money.js";
import type { CurrencyCode, MinorUnits } from "../../src/model/primitives.js";
import {
  CurrencyCodeSchema,
  MinorUnitsSchema,
  MoneySchema,
} from "../../src/model/primitives.js";
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

const minorOf = (value: number) => euro(value).minor;

const rateOf = (text: string) => Schema.decodeSync(RateSchema)(text);

const minorUnits = (value: number): MinorUnits =>
  Schema.decodeSync(MinorUnitsSchema)(value);

const unguardedMinorUnits = Schema.Finite.pipe(Schema.brand("MinorUnits"));

const forgedMinorUnits = (value: number): MinorUnits =>
  Schema.decodeSync(unguardedMinorUnits)(value);

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

  it.effect(
    "adding past the safe integer range fails with MoneyOverflow instead of throwing",
    () =>
      Effect.gen(function* overflowIsATypedFailure() {
        const sum = yield* Effect.flip(
          addMoney(euro(Number.MAX_SAFE_INTEGER), euro(1))
        );

        expect(sum).toStrictEqual(
          moneyOverflow({
            currency: euro(0).currency,
            left: minorOf(Number.MAX_SAFE_INTEGER),
            operation: "add",
            right: minorOf(1),
          })
        );

        const difference = yield* Effect.flip(
          subtractMoney(euro(Number.MIN_SAFE_INTEGER), euro(1))
        );

        expect(difference).toStrictEqual(
          moneyOverflow({
            currency: euro(0).currency,
            left: minorOf(Number.MIN_SAFE_INTEGER),
            operation: "subtract",
            right: minorOf(1),
          })
        );
      })
  );

  it.effect.prop(
    "arithmetic either lands on the exact sum or reports MoneyOverflow",
    {
      left: Arbitrary.schema(Schema.Int),
      right: Arbitrary.schema(Schema.Int),
    },
    ({ left, right }) =>
      Effect.gen(function* arithmeticStaysInRange() {
        const sum = yield* Effect.result(addMoney(euro(left), euro(right)));
        const expected = BigInt(left) + BigInt(right);

        if (
          expected < BigInt(Number.MIN_SAFE_INTEGER) ||
          expected > BigInt(Number.MAX_SAFE_INTEGER)
        ) {
          expect(Result.isFailure(sum) && sum.failure).toStrictEqual(
            moneyOverflow({
              currency: euro(0).currency,
              left: minorOf(left),
              operation: "add",
              right: minorOf(right),
            })
          );
        } else {
          expect(Result.isSuccess(sum) && sum.success).toStrictEqual(
            euro(Number(expected))
          );
        }
      }),
    { arbitrary: { runs: 200 } }
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
          currencyMismatch({ left: euro(0).currency, right: currency })
        );

        const subtractionFailure = yield* Effect.flip(
          subtractMoney(moneyOf(currency, amount), euro(amount))
        );

        expect(subtractionFailure).toStrictEqual(
          currencyMismatch({ left: currency, right: euro(0).currency })
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
          rateUnavailable({ from: currency, to: euro(0).currency })
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

        expect([base.currency, base.minor]).toStrictEqual([
          money.currency,
          money.minor,
        ]);
        expect(base).toBeInstanceOf(BaseAmount);
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

  it.effect("scales by both currencies' minor unit exponents", () =>
    Effect.gen(function* exponentScaling() {
      expect(yield* convertedMinor(1000, "USD", "JPY", "150")).toBe(1500);
      expect(yield* convertedMinor(1500, "JPY", "USD", "0.0067")).toBe(1005);
      expect(yield* convertedMinor(1000, "USD", "BHD", "0.376")).toBe(3760);
      expect(yield* convertedMinor(1234, "EUR", "GBP", "0.85")).toBe(1049);
    })
  );

  it.effect("fails with ConversionOverflow instead of losing precision", () =>
    Effect.gen(function* overflowFails() {
      const large = moneyOf("USD", Number.MAX_SAFE_INTEGER);

      const failure = yield* Effect.flip(
        convert(large, currencyOf("GBP"), rateLookup("2"))
      );

      expect(failure).toStrictEqual(
        conversionOverflow({
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
        Result.getOrThrow(
          convertMinor(
            minorUnits(amount),
            currencyOf("USD"),
            currencyOf("GBP"),
            rateOf(text)
          )
        )
      ).toBe(Number(expected));
    },
    { arbitrary: { runs: 200 } }
  );

  it("fails with ConversionInputInvalid for an unsafe integer instead of losing precision", () => {
    const unsafe = forgedMinorUnits(Number.MAX_SAFE_INTEGER + 2);

    const outcome = convertMinor(
      unsafe,
      currencyOf("USD"),
      currencyOf("GBP"),
      rateOf("2")
    );

    expect(Result.isFailure(outcome) && outcome.failure).toStrictEqual(
      conversionInputInvalid({
        from: currencyOf("USD"),
        reason: "unsafe",
        to: currencyOf("GBP"),
      })
    );
  });

  it("fails with ConversionInputInvalid for a fractional amount instead of throwing", () => {
    const fractional = forgedMinorUnits(1.5);

    const outcome = convertMinor(
      fractional,
      currencyOf("USD"),
      currencyOf("GBP"),
      rateOf("2")
    );

    expect(Result.isFailure(outcome) && outcome.failure).toStrictEqual(
      conversionInputInvalid({
        from: currencyOf("USD"),
        reason: "fractional",
        to: currencyOf("GBP"),
      })
    );
  });

  it("refuses an unsafe integer at the type level", () => {
    const unsafeInteger = Number.MAX_SAFE_INTEGER + 2;

    // @ts-expect-error -- an unsafe integer is not a number of minor units
    const unsafe: MinorUnits = unsafeInteger;
    // @ts-expect-error -- a fractional number is not a number of minor units
    const fractional: MinorUnits = 1.5;

    expect(unsafe).toBe(unsafeInteger);
    expect(fractional).toBe(1.5);
  });
});

describe("minor unit exponents", () => {
  const zeroExponent = [
    "BIF",
    "CLP",
    "DJF",
    "GNF",
    "ISK",
    "JPY",
    "KMF",
    "KRW",
    "PYG",
    "RWF",
    "UGX",
    "UYI",
    "VND",
    "VUV",
    "XAF",
    "XOF",
    "XPF",
  ];

  const threeExponent = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"];
  const fourExponent = ["CLF", "UYW"];
  const twoExponent = ["CHF", "EUR", "GBP", "USD", "ZAR"];

  it("reads each code's exponent from the one ISO 4217 table", () => {
    for (const code of zeroExponent) {
      expect(minorUnitExponent(currencyOf(code))).toBe(0);
    }

    for (const code of threeExponent) {
      expect(minorUnitExponent(currencyOf(code))).toBe(3);
    }

    for (const code of fourExponent) {
      expect(minorUnitExponent(currencyOf(code))).toBe(4);
    }

    for (const code of twoExponent) {
      expect(minorUnitExponent(currencyOf(code))).toBe(2);
    }
  });
});

describe("a base amount exists only as conversion output", () => {
  it("refuses a raw amount typed as a base amount", () => {
    // @ts-expect-error -- a base amount is only ever what a conversion produced
    const fabricated: BaseAmount = {
      currency: currencyOf("EUR"),
      minor: euro(999_999).minor,
    };

    expect(fabricated).not.toBeInstanceOf(BaseAmount);
    expect(fabricated.minor).toBe(999_999);
  });

  it.effect("refuses a spread that invents a converted total", () =>
    Effect.gen(function* spreadIsNotABaseAmount() {
      const base = yield* convert(
        euro(1000),
        currencyOf("GBP"),
        rateLookup("2")
      );

      expect(base).toBeInstanceOf(BaseAmount);

      // oxlint-disable-next-line typescript/no-misused-spread -- the spread is the illegal construction this test proves a type error
      const forged = { ...base, minor: minorOf(999_999) };

      // @ts-expect-error -- a base amount is nominal, so a spread cannot stand in for one
      const claimed: BaseAmount = forged;

      expect(forged).not.toBeInstanceOf(BaseAmount);
      expect(claimed.minor).toBe(999_999);
    })
  );

  it.effect("refuses a subclass that reuses a conversion", () =>
    Effect.gen(function* noSubclassPath() {
      const base = yield* convert(
        euro(1000),
        currencyOf("GBP"),
        rateLookup("2")
      );

      // @ts-expect-error -- a base amount has a private constructor, so no subclass can extend it
      class ForgedBaseAmount extends BaseAmount {}

      // @ts-expect-error -- an inherited private constructor is not callable from outside
      const forged = new ForgedBaseAmount(currencyOf("GBP"), minorOf(999_999));

      expect(forged.minor).toBe(999_999);
      expect(Object.getPrototypeOf(base)).toBe(BaseAmount.prototype);
    })
  );

  it("exposes no reachable schema that brands a raw amount as a base amount", () => {
    // @ts-expect-error -- the converted member of the union carries no base field schema
    const fields: unknown = AmountsSchema.members[0].fields;

    expect(fields).toBeUndefined();
  });

  it("decodes no raw amount as an amount", () => {
    expect(() =>
      Schema.decodeUnknownSync(AmountsSchema)({
        currency: "EUR",
        minor: 999_999,
      })
    ).toThrow();
  });
});
