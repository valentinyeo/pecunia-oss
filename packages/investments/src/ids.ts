import { Schema } from "effect";

import { HoldingIdSchema } from "./model.js";
import type { HoldingId } from "./model.js";

const TIMESTAMP_BYTES = 6;

const hexOf = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

export const newHoldingId = (millis: number): HoldingId => {
  const bytes = new Uint8Array(16);

  globalThis.crypto.getRandomValues(bytes);

  const stamp = BigInt(millis);

  for (let index = 0; index < TIMESTAMP_BYTES; index += 1) {
    bytes[index] = Number(
      (stamp / 2n ** BigInt(8 * (TIMESTAMP_BYTES - 1 - index))) % 256n
    );
  }

  bytes[6] = ((bytes[6] ?? 0) % 16) + 0x70;
  bytes[8] = ((bytes[8] ?? 0) % 64) + 0x80;

  const hex = hexOf(bytes);

  return Schema.decodeSync(HoldingIdSchema)(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  );
};
