import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import {
  AmountsSchema,
  ConvertedAmount,
  convertedAmounts,
} from "../../src/model/money.js";
import type { Amounts } from "../../src/model/money.js";
import type { CurrencyCode } from "../../src/model/primitives.js";
import {
  CurrencyCodeSchema,
  DateOnlySchema,
  MoneySchema,
} from "../../src/model/primitives.js";
import { RateSchema } from "../../src/model/rate.js";

const currencyOf = (code: string): CurrencyCode =>
  Schema.decodeSync(CurrencyCodeSchema)(code);

const moneyOf = (code: string, minor: number) =>
  Schema.decodeSync(MoneySchema)({ currency: code, minor });

const minorOf = (value: number) => moneyOf("EUR", value).minor;

const rateOf = (text: string) => Schema.decodeSync(RateSchema)(text);

const dateOnly = (text: string) => Schema.decodeSync(DateOnlySchema)(text);

describe("a converted amount keeps one source of truth", () => {
  it.effect("refuses a spread that retargets the source", () =>
    Effect.gen(function* spreadCannotLie() {
      const stored = yield* convertedAmounts(
        moneyOf("USD", 1000),
        currencyOf("EUR"),
        rateOf("0.85"),
        dateOnly("2024-01-30")
      );

      // oxlint-disable-next-line typescript/no-misused-spread -- the spread is the illegal construction this test proves a type error
      const retargeted = { ...stored, source: moneyOf("GBP", 5000) };

      // @ts-expect-error -- a converted amount is nominal, so a spread cannot stand in for one
      const amounts: Amounts = retargeted;

      expect([stored.base.currency, stored.base.minor]).toStrictEqual([
        "EUR",
        850,
      ]);
      expect(() => Schema.encodeSync(AmountsSchema)(amounts)).toThrow();
    })
  );

  it.effect("refuses a subclass that reuses a conversion", () =>
    Effect.gen(function* noSubclassPath() {
      const stored = yield* convertedAmounts(
        moneyOf("USD", 1000),
        currencyOf("EUR"),
        rateOf("0.85"),
        dateOnly("2024-01-30")
      );

      // @ts-expect-error -- a converted amount has a private constructor, so no subclass can extend it
      class ForgedConvertedAmount extends ConvertedAmount {}

      // @ts-expect-error -- an inherited private constructor is not callable from outside
      const forged = new ForgedConvertedAmount({
        asOf: stored.asOf,
        base: stored.base,
        rate: stored.rate,
        source: moneyOf("GBP", 5000),
      });

      expect(forged.source.currency).toBe("GBP");
      expect(Object.getPrototypeOf(stored)).toBe(ConvertedAmount.prototype);
    })
  );

  it.effect("refuses an assigned source that reuses a real conversion", () =>
    Effect.gen(function* assignCannotLie() {
      const stored = yield* convertedAmounts(
        moneyOf("USD", 1000),
        currencyOf("EUR"),
        rateOf("0.85"),
        dateOnly("2024-01-30")
      );

      const forged = Object.assign(stored, { source: moneyOf("GBP", 5000) });

      expect(() => Schema.encodeSync(AmountsSchema)(forged)).toThrow();
    })
  );

  it.effect("refuses an assigned base that reuses a real conversion", () =>
    Effect.gen(function* assignCannotInvent() {
      const stored = yield* convertedAmounts(
        moneyOf("USD", 1000),
        currencyOf("EUR"),
        rateOf("0.85"),
        dateOnly("2024-01-30")
      );

      const forged = Object.assign(stored, {
        base: { currency: currencyOf("EUR"), minor: minorOf(1) },
      });

      expect(() => Schema.encodeUnknownSync(AmountsSchema)(forged)).toThrow();
    })
  );
});
