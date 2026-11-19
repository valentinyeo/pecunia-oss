import { describe, expect, it } from "@effect/vitest";

import { parse } from "../../src/model/codec.js";
import { codecs } from "../../src/model/codecs.js";
import * as modelModule from "../../src/model/index.js";
import * as moneyModule from "../../src/model/money.js";
import * as primitivesModule from "../../src/model/primitives.js";

describe("domain primitives", () => {
  it("rejects a float minor amount", () => {
    expect(() =>
      parse(codecs.money, { currency: "EUR", minor: 12.5 })
    ).toThrow();
  });

  it("rejects a lowercase currency code", () => {
    expect(() =>
      parse(codecs.money, { currency: "eur", minor: 100 })
    ).toThrow();
  });

  it("rejects an amount without a currency", () => {
    expect(() => parse(codecs.money, { minor: 100 })).toThrow();
  });

  it("accepts a UUIDv7 id and rejects another UUID version", () => {
    const v7 = "018f2b7c-1234-7abc-8def-0123456789ab";
    const v4 = "018f2b7c-1234-4abc-8def-0123456789ab";

    expect(parse(codecs.profileId, v7)).toBe(v7);
    expect(parse(codecs.transactionId, v7)).toBe(v7);
    expect(() => parse(codecs.profileId, v4)).toThrow();
    expect(() => parse(codecs.profileId, "demo-profile")).toThrow();
  });

  it("exposes no schema that brands an arbitrary amount as a base amount", () => {
    expect(Object.keys(primitivesModule)).not.toContain("BaseAmountSchema");
    expect(Object.keys(moneyModule)).not.toContain("BaseAmountSchema");
    expect(Object.keys(modelModule)).not.toContain("BaseAmountSchema");
  });

  it("rejects a date that is not in YYYY-MM-DD form", () => {
    expect(parse(codecs.dateOnly, "2024-01-31")).toBe("2024-01-31");
    expect(() => parse(codecs.dateOnly, "31/01/2024")).toThrow();
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
      expect(() => parse(codecs.dateOnly, text)).toThrow();
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
      expect(parse(codecs.dateOnly, text)).toBe(text);
    }
  });
});
