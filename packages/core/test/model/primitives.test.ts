import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  DateOnlySchema,
  MoneySchema,
  ProfileIdSchema,
  RateSchema,
  TransactionIdSchema,
} from "../../src/model/primitives.js";

describe("domain primitives", () => {
  it("rejects a float minor amount", () => {
    expect(() =>
      Schema.decodeSync(MoneySchema)({ currency: "EUR", minor: 12.5 })
    ).toThrow();
  });

  it("rejects a lowercase currency code", () => {
    expect(() =>
      Schema.decodeSync(MoneySchema)({ currency: "eur", minor: 100 })
    ).toThrow();
  });

  it("rejects an amount without a currency", () => {
    expect(() =>
      Schema.decodeUnknownSync(MoneySchema)({ minor: 100 })
    ).toThrow();
  });

  it("rejects a zero or negative exchange rate", () => {
    expect(() => Schema.decodeSync(RateSchema)(0)).toThrow();
    expect(() => Schema.decodeSync(RateSchema)(-1)).toThrow();
  });

  it("accepts a UUIDv7 id and rejects another UUID version", () => {
    const v7 = "018f2b7c-1234-7abc-8def-0123456789ab";
    const v4 = "018f2b7c-1234-4abc-8def-0123456789ab";

    expect(Schema.decodeSync(ProfileIdSchema)(v7)).toBe(v7);
    expect(Schema.decodeSync(TransactionIdSchema)(v7)).toBe(v7);
    expect(() => Schema.decodeSync(ProfileIdSchema)(v4)).toThrow();
    expect(() => Schema.decodeSync(ProfileIdSchema)("demo-profile")).toThrow();
  });

  it("rejects a date that is not in YYYY-MM-DD form", () => {
    expect(Schema.decodeSync(DateOnlySchema)("2024-01-31")).toBe("2024-01-31");
    expect(() => Schema.decodeSync(DateOnlySchema)("31/01/2024")).toThrow();
  });
});
