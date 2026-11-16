import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import * as modelModule from "../../src/model/index.js";
import * as moneyModule from "../../src/model/money.js";
import * as primitivesModule from "../../src/model/primitives.js";
import {
  DateOnlySchema,
  MoneySchema,
  ProfileIdSchema,
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

  it("accepts a UUIDv7 id and rejects another UUID version", () => {
    const v7 = "018f2b7c-1234-7abc-8def-0123456789ab";
    const v4 = "018f2b7c-1234-4abc-8def-0123456789ab";

    expect(Schema.decodeSync(ProfileIdSchema)(v7)).toBe(v7);
    expect(Schema.decodeSync(TransactionIdSchema)(v7)).toBe(v7);
    expect(() => Schema.decodeSync(ProfileIdSchema)(v4)).toThrow();
    expect(() => Schema.decodeSync(ProfileIdSchema)("demo-profile")).toThrow();
  });

  it("exposes no schema that brands an arbitrary amount as a base amount", () => {
    expect(Object.keys(primitivesModule)).not.toContain("BaseAmountSchema");
    expect(Object.keys(moneyModule)).not.toContain("BaseAmountSchema");
    expect(Object.keys(modelModule)).not.toContain("BaseAmountSchema");
  });

  it("rejects a date that is not in YYYY-MM-DD form", () => {
    expect(Schema.decodeSync(DateOnlySchema)("2024-01-31")).toBe("2024-01-31");
    expect(() => Schema.decodeSync(DateOnlySchema)("31/01/2024")).toThrow();
  });

  it("rejects a date no calendar has", () => {
    const impossible = [
      "2024-00-10",
      "2024-13-01",
      "2024-01-00",
      "2024-01-32",
      "2024-04-31",
      "2024-99-99",
      "2023-02-29",
      "2024-02-30",
      "1900-02-29",
    ];

    for (const text of impossible) {
      expect(() => Schema.decodeSync(DateOnlySchema)(text)).toThrow();
    }
  });

  it("accepts the last day of every month and a leap day", () => {
    const possible = [
      "2024-01-31",
      "2024-02-29",
      "2000-02-29",
      "2024-04-30",
      "2024-12-31",
    ];

    for (const text of possible) {
      expect(Schema.decodeSync(DateOnlySchema)(text)).toBe(text);
    }
  });
});
