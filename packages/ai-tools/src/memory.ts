import { ProfileIdSchema } from "@pecunia/access";
import { BankLineService } from "@pecunia/bank-lines";
import type { BankLine, BankLineStore } from "@pecunia/bank-lines";
import { memoryBankLineStoreLayer } from "@pecunia/bank-lines/memory";
import type { MemoryCategory } from "@pecunia/bank-lines/memory";
import type { Category } from "@pecunia/categorize";
import { Layer, Schema } from "effect";

import { memoryAuditLogLayer } from "./audit.js";
import type { AuditLog } from "./audit.js";
import { memoryCategoryStoreLayer } from "./category-store.js";
import type { CategoryStore } from "./category-store.js";
import { CategoryIdSchema } from "./primitives.js";
import { memoryReportStoreLayer } from "./report-store.js";
import type { ReportStore, ReportSummary } from "./report-store.js";
import { memorySuggestionStoreLayer } from "./suggestion-store.js";
import type {
  CategorySuggestion,
  SuggestionStore,
} from "./suggestion-store.js";

export interface MemoryToolsSeed {
  readonly categories: readonly Category[];
  readonly lines: readonly BankLine[];
  readonly reports: readonly ReportSummary[];
  readonly suggestions: readonly CategorySuggestion[];
}

const lineCategories = (
  categories: readonly Category[]
): readonly MemoryCategory[] =>
  categories.map((category) => ({
    id: Schema.decodeSync(CategoryIdSchema)(category.id),
    profileId: Schema.decodeSync(ProfileIdSchema)(category.profileId),
  }));

export const memoryToolsLayer = (
  seed: MemoryToolsSeed
): Layer.Layer<
  | AuditLog
  | BankLineService
  | BankLineStore
  | CategoryStore
  | ReportStore
  | SuggestionStore
> => {
  const stores = Layer.mergeAll(
    memoryBankLineStoreLayer({
      categories: lineCategories(seed.categories),
      lines: seed.lines,
    }),
    memoryCategoryStoreLayer(seed.categories),
    memoryReportStoreLayer(seed.reports),
    memorySuggestionStoreLayer(seed.suggestions),
    memoryAuditLogLayer
  );

  return Layer.merge(stores, BankLineService.layer.pipe(Layer.provide(stores)));
};
