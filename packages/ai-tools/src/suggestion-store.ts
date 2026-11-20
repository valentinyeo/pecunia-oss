import { ProfileIdSchema } from "@pecunia/access";
import type { ProfileId } from "@pecunia/access";
import { Context, Effect, Layer, Ref, Schema } from "effect";

import {
  BankLineIdSchema,
  CategoryIdSchema,
  TimestampMillisSchema,
} from "./primitives.js";

export const CategorySuggestionSchema = Schema.Struct({
  categoryId: CategoryIdSchema,
  lineId: BankLineIdSchema,
  profileId: ProfileIdSchema,
  suggestedAt: TimestampMillisSchema,
});

export type CategorySuggestion = typeof CategorySuggestionSchema.Type;

export interface SuggestionStorePort {
  readonly list: (
    profileId: ProfileId
  ) => Effect.Effect<readonly CategorySuggestion[]>;
  readonly record: (suggestion: CategorySuggestion) => Effect.Effect<void>;
}

export class SuggestionStore extends Context.Service<
  SuggestionStore,
  SuggestionStorePort
>()("@pecunia/ai-tools/SuggestionStore") {}

const replaceSuggestion = (
  current: readonly CategorySuggestion[],
  next: CategorySuggestion
): readonly CategorySuggestion[] => [
  ...current.filter(
    (suggestion) =>
      suggestion.lineId !== next.lineId ||
      suggestion.profileId !== next.profileId
  ),
  next,
];

export const memorySuggestionStoreLayer = (
  initial: readonly CategorySuggestion[]
): Layer.Layer<SuggestionStore> =>
  Layer.effect(
    SuggestionStore,
    Effect.gen(function* makeMemorySuggestionStore() {
      const suggestions =
        yield* Ref.make<readonly CategorySuggestion[]>(initial);

      return {
        list: (profileId) =>
          Effect.map(Ref.get(suggestions), (current) =>
            current.filter((suggestion) => suggestion.profileId === profileId)
          ),
        record: (suggestion) =>
          Ref.update(suggestions, (current) =>
            replaceSuggestion(current, suggestion)
          ),
      } as const;
    })
  );
