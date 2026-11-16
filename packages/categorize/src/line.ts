import { Schema } from "effect";

import { MinorUnitsSchema } from "./amount.js";

export const LineDirectionSchema = Schema.Literals(["in", "neutral", "out"]);

export type LineDirection = typeof LineDirectionSchema.Type;

export const MatchableLineSchema = Schema.Struct({
  description: Schema.String,
  direction: LineDirectionSchema,
  merchant: Schema.String,
  minorAmount: MinorUnitsSchema,
  reference: Schema.String,
});

export type MatchableLine = typeof MatchableLineSchema.Type;
