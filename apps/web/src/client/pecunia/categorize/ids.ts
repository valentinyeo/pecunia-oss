import { Schema } from "effect";

export const PaymentIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("PaymentId"));

export type PaymentId = typeof PaymentIdSchema.Type;

export const TimestampMillisSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("TimestampMillis"));

export type TimestampMillis = typeof TimestampMillisSchema.Type;

const hex = (value: number, width: number): string =>
  value.toString(16).padStart(width, "0");

const RAND_A_BITS = 0x10_00;

const RAND_B_BITS = 2 ** 60;

const HIGH_BITS = 2 ** 48;

export const uuidV7At = (millis: number, counter: number): string => {
  const time = millis % 2 ** 48;
  const randA = counter % RAND_A_BITS;
  const randB = Math.floor(counter / RAND_A_BITS) % RAND_B_BITS;

  return [
    hex(Math.floor(time / 0x1_00_00), 8),
    hex(time % 0x1_00_00, 4),
    `7${hex(randA, 3)}`,
    `8${hex(Math.floor(randB / HIGH_BITS), 3)}`,
    hex(randB % HIGH_BITS, 12),
  ].join("-");
};
