import {
  Cause,
  Duration,
  Effect,
  Exit,
  Option,
  Predicate,
  Schema,
} from "effect";

import {
  CategorizationSchema,
  CategoryChoiceSchema,
  ConfidenceSchema,
  defaultSortSettings,
  LineIdSchema,
  ProviderNameSchema,
  SortableLineSchema,
  SortSettingsSchema,
} from "./model.js";
import type {
  CategoryChoice,
  ProviderName,
  SortableLine,
  SortSettings,
} from "./model.js";
import { SortingProvider } from "./provider.js";
import type { SortingProviderPort } from "./provider.js";

export const SortFailureReasonSchema = Schema.Literals(["failed", "timed-out"]);

export type SortFailureReason = typeof SortFailureReasonSchema.Type;

export const SortFailureSchema = Schema.Struct({
  lineId: LineIdSchema,
  provider: ProviderNameSchema,
  reason: SortFailureReasonSchema,
});

export type SortFailure = typeof SortFailureSchema.Type;

export const SortRequestSchema = Schema.Struct({
  categories: Schema.Array(CategoryChoiceSchema),
  lines: Schema.Array(SortableLineSchema),
  settings: Schema.optional(SortSettingsSchema),
});

export type SortRequest = typeof SortRequestSchema.Type;

export const SortResultSchema = Schema.Struct({
  failures: Schema.Array(SortFailureSchema),
  lines: Schema.Array(SortableLineSchema),
});

export type SortResult = typeof SortResultSchema.Type;

interface LineOutcome {
  readonly failure?: SortFailure;
  readonly line: SortableLine;
}

const failureFor = (
  line: SortableLine,
  provider: ProviderName,
  reason: SortFailureReason
): SortFailure => ({ lineId: line.id, provider, reason });

const sortLine = (
  provider: SortingProviderPort,
  line: SortableLine,
  categories: readonly CategoryChoice[],
  settings: SortSettings
): Effect.Effect<LineOutcome> =>
  Effect.gen(function* sortOneLine() {
    if (!Predicate.isTagged(line.categorization, "Unsorted")) {
      return { line };
    }

    const exit = yield* provider
      .suggest(line, categories)
      .pipe(
        Effect.timeoutOption(Duration.millis(settings.timeoutMillis)),
        Effect.exit
      );

    if (Exit.isFailure(exit)) {
      if (Cause.hasInterrupts(exit.cause)) {
        return yield* Effect.interrupt;
      }

      return { failure: failureFor(line, provider.name, "failed"), line };
    }

    if (Option.isNone(exit.value)) {
      return { failure: failureFor(line, provider.name, "timed-out"), line };
    }

    const suggestion = exit.value.value;

    if (!Predicate.isTagged(suggestion, "Suggested")) {
      return { line };
    }

    const confidence = Schema.decodeOption(ConfidenceSchema)(
      suggestion.confidence
    );

    const listed = categories.some(
      (category) => category.id === suggestion.categoryId
    );

    if (
      Option.isNone(confidence) ||
      !listed ||
      confidence.value < settings.threshold
    ) {
      return { line };
    }

    return {
      line: {
        ...line,
        categorization: CategorizationSchema.cases.Suggested.make({
          categoryId: suggestion.categoryId,
          confidence: confidence.value,
          provider: provider.name,
        }),
      },
    };
  });

export const sortLines = (
  request: SortRequest
): Effect.Effect<SortResult, never, SortingProvider> =>
  Effect.gen(function* runSort() {
    const provider = yield* SortingProvider;
    const settings = request.settings ?? defaultSortSettings;

    const outcomes = yield* Effect.forEach(
      request.lines,
      (line) => sortLine(provider, line, request.categories, settings),
      { concurrency: 1 }
    );

    const failures = outcomes.flatMap((outcome) =>
      outcome.failure === undefined ? [] : [outcome.failure]
    );

    return { failures, lines: outcomes.map((outcome) => outcome.line) };
  });
