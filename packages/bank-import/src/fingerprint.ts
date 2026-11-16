import { Effect, Schema } from "effect";
import { Digest } from "effect/crypto";

import { FingerprintSchema } from "./line.js";
import type { FingerprintedLine, ParsedLine } from "./line.js";

const textEncoder = new TextEncoder();

const FIELD_SEPARATOR = "\u001F";

const canonicalText = (line: ParsedLine) =>
  [
    line.date,
    line.description,
    line.amountMinor.toString(),
    line.currency,
    line.reference,
  ].join(FIELD_SEPARATOR);

export const fingerprintLine = Effect.fn("fingerprintLine")(
  function* fingerprintLine(
    line: ParsedLine
  ): Effect.fn.Return<FingerprintedLine, never, Digest.Digest> {
    const digest = yield* Digest.Digest;

    const hex = yield* digest.digestHex(
      Digest.sha256,
      textEncoder.encode(canonicalText(line))
    );

    const fingerprint = yield* Schema.decodeEffect(FingerprintSchema)(
      `csv-${hex}`
    ).pipe(Effect.orDie);

    return { ...line, fingerprint };
  }
);
