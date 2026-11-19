import { DateTime } from "effect";

import { decodeModel } from "./codec.js";
import type { Operation } from "./operation.js";
import { carries, valueOperation } from "./operation.js";
import type { Timestamp, TimestampParts } from "./primitives.js";
import { TimestampSchema } from "./primitives.js";

const instant = "2024-02-01T09:00:00.000Z";

export const timestampSample = (): Timestamp =>
  decodeModel(TimestampSchema, instant);

export const timestampArgument = () =>
  carries("Timestamp", TimestampSchema, timestampSample, ["TimestampSchema"]);

export const timestampOfOperation: Operation<[string], Timestamp> =
  valueOperation({
    arguments: [timestampArgument()],
    name: "timestampOf",
    run: (text: string): Timestamp => decodeModel(TimestampSchema, text),
    samples: () => [instant],
  });

export const timestampPartsOperation: Operation<[Timestamp], TimestampParts> =
  valueOperation({
    arguments: [timestampArgument()],
    name: "timestampParts",
    run: (timestamp: Timestamp): TimestampParts => {
      const parts = DateTime.toPartsUtc(
        DateTime.makeUnsafe(decodeModel(TimestampSchema, timestamp))
      );

      return Object.freeze({
        day: parts.day,
        hour: parts.hour,
        millisecond: parts.millisecond,
        minute: parts.minute,
        month: parts.month,
        second: parts.second,
        year: parts.year,
      });
    },
    samples: () => [timestampSample()],
  });

export const timestampOf: typeof timestampOfOperation.apply =
  timestampOfOperation.apply;

export const timestampParts: typeof timestampPartsOperation.apply =
  timestampPartsOperation.apply;
