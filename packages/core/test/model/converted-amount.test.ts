// oxlint-disable typescript/no-misused-spread, typescript/no-unsafe-type-assertion, anti-slop/require-safety-comment-for-type-assertion -- this test forges a plain copy of a class instance on purpose, because a copy that loses the prototype must never reach the model
import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { parse } from "../../src/model/codec.js";
import { codecs } from "../../src/model/codecs.js";
import {
  AmountsSchema,
  ConvertedAmount,
  convertedAmounts,
} from "../../src/model/money.js";
import type { Amounts } from "../../src/model/money.js";
import type { CurrencyCode } from "../../src/model/primitives.js";

const currencyOf = (code: string): CurrencyCode =>
  parse(codecs.currencyCode, code);

const moneyOf = (code: string, minor: number) =>
  parse(codecs.money, { currency: code, minor });

const minorOf = (value: number) => moneyOf("EUR", value).minor;

const rateOf = (text: string) => parse(codecs.rate, text);

const dateOnly = (text: string) => parse(codecs.dateOnly, text);

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

      expect(() =>
        Object.assign(stored, { source: moneyOf("GBP", 5000) })
      ).toThrow(/source/u);

      const forged = { ...stored, source: moneyOf("GBP", 5000) } as never;

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

      expect(() =>
        Object.assign(stored, {
          base: { currency: currencyOf("EUR"), minor: minorOf(1) },
        })
      ).toThrow(/base/u);

      const forged = {
        ...stored,
        base: { currency: currencyOf("EUR"), minor: minorOf(1) },
      } as never;

      expect(() => Schema.encodeUnknownSync(AmountsSchema)(forged)).toThrow();
    })
  );
});
