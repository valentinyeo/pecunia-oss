import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { parse } from "../../src/model/codec.js";
import { codecs } from "../../src/model/codecs.js";
import { RATE_SCALE, RateSchema } from "../../src/model/rate.js";

describe("exchange rates are exact decimals", () => {
  it("decodes a decimal string into a scaled integer", () => {
    expect(parse(codecs.rate, "1.005")).toBe(1_005_000_000_000n);
    expect(parse(codecs.rate, "150")).toBe(150_000_000_000_000n);
    expect(parse(codecs.rate, "0.0067")).toBe(6_700_000_000n);
    expect(parse(codecs.rate, "0.000000000001")).toBe(1n);
  });

  it("encodes back to the same decimal string", () => {
    for (const text of ["1.005", "150", "0.0067", "0.000000000001", "1"]) {
      expect(Schema.encodeSync(RateSchema)(parse(codecs.rate, text))).toBe(
        text
      );
    }
  });

  it("rejects a sign, an exponent, a bare point or a long fraction", () => {
    for (const text of [
      "-1",
      "+1",
      "1e3",
      "1.",
      ".5",
      "",
      "1.0000000000001",
      "1,5",
      " 1",
      "1 ",
    ]) {
      expect(() => parse(codecs.rate, text)).toThrow();
    }
  });

  it("rejects zero and a float in place of a decimal string", () => {
    expect(() => parse(codecs.rate, "0")).toThrow();
    expect(() => parse(codecs.rate, "0.000")).toThrow();
    expect(() => parse(codecs.rate, "00")).toThrow();
    expect(() => parse(codecs.rate, 1.005)).toThrow();
  });

  it("holds every rate at twelve fraction digits", () => {
    expect(RATE_SCALE).toBe(12);
  });
});
