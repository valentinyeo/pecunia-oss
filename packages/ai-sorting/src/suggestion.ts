import { Option, Schema } from "effect";

import type { CategoryChoice } from "./model.js";
import { CategoryIdSchema, ConfidenceSchema } from "./model.js";

export const NoSuggestionReasonSchema = Schema.Literals([
  "invalid-answer",
  "no-answer",
]);

export type NoSuggestionReason = typeof NoSuggestionReasonSchema.Type;

export const SuggestionSchema = Schema.TaggedUnion({
  NoSuggestion: { reason: NoSuggestionReasonSchema },
  Suggested: {
    categoryId: CategoryIdSchema,
    confidence: ConfidenceSchema,
  },
});

export type Suggestion = typeof SuggestionSchema.Type;

export const ProviderAnswerSchema = Schema.Struct({
  categoryId: Schema.optional(Schema.String),
  confidence: Schema.optional(Schema.Finite),
  kind: Schema.optional(Schema.String),
});

export type ProviderAnswer = typeof ProviderAnswerSchema.Type;

const invalidAnswer = SuggestionSchema.cases.NoSuggestion.make({
  reason: "invalid-answer",
});

const noAnswer = SuggestionSchema.cases.NoSuggestion.make({
  reason: "no-answer",
});

export const parseProviderAnswer = (
  answer: ProviderAnswer,
  categories: readonly CategoryChoice[]
): Suggestion => {
  const decoded = Schema.decodeOption(ProviderAnswerSchema)(answer);

  if (Option.isNone(decoded)) {
    return invalidAnswer;
  }

  const { categoryId, confidence, kind } = decoded.value;

  if (kind === "none") {
    return noAnswer;
  }

  if (
    kind !== "suggested" ||
    categoryId === undefined ||
    confidence === undefined
  ) {
    return invalidAnswer;
  }

  const known = categories.find((category) => category.id === categoryId);

  if (known === undefined) {
    return invalidAnswer;
  }

  const parsedConfidence = Schema.decodeOption(ConfidenceSchema)(confidence);

  if (Option.isNone(parsedConfidence)) {
    return invalidAnswer;
  }

  return SuggestionSchema.cases.Suggested.make({
    categoryId: known.id,
    confidence: parsedConfidence.value,
  });
};
