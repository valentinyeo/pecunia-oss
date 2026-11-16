import { Schema, SchemaGetter } from "effect";

import type { Exact } from "./codec.js";

export const RATE_SCALE = 12;

export const RATE_SCALE_FACTOR = 10n ** BigInt(RATE_SCALE);

const decimalPattern = /^\d+(?:\.\d{1,12})?$/u;

const toUnits = (text: string): bigint => {
  const [whole = "", fraction = ""] = text.split(".");

  return (
    BigInt(`${whole}${fraction}`) * 10n ** BigInt(RATE_SCALE - fraction.length)
  );
};

const toText = (units: bigint): string => {
  const padded = units.toString().padStart(RATE_SCALE + 1, "0");
  const cut = padded.length - RATE_SCALE;
  const whole = padded.slice(0, cut);
  const fraction = padded.slice(cut).replace(/0+$/u, "");

  return fraction.length === 0 ? whole : `${whole}.${fraction}`;
};

export const RateSchema = Schema.String.check(
  Schema.isPattern(decimalPattern)
).pipe(
  Schema.decodeTo(
    Schema.BigInt.check(Schema.isGreaterThanBigInt(0n)).pipe(
      Schema.brand("Rate")
    ),
    {
      decode: SchemaGetter.transform(toUnits),
      encode: SchemaGetter.transform(toText),
    }
  )
);

export type Rate = Exact<typeof RateSchema.Type>;

export const rateText = (rate: Rate): string => toText(rate);
