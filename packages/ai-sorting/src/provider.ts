import { Context } from "effect";
import type { Effect } from "effect";

import type { CategoryChoice, ProviderName, SortableLine } from "./model.js";
import type { SortingProviderError } from "./sorting-provider-error.js";
import type { Suggestion } from "./suggestion.js";

export interface SortingProviderPort {
  readonly name: ProviderName;
  readonly suggest: (
    line: SortableLine,
    categories: readonly CategoryChoice[]
  ) => Effect.Effect<Suggestion, SortingProviderError>;
}

export class SortingProvider extends Context.Service<
  SortingProvider,
  SortingProviderPort
>()("@pecunia/ai-sorting/SortingProvider") {}
