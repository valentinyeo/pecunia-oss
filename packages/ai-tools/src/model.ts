import { BankLineSchema, CursorFingerprintSchema } from "@pecunia/bank-lines";
import type { BankLineCursor } from "@pecunia/bank-lines";
import { CategorySchema } from "@pecunia/categorize";
import { Schema } from "effect";

import { DaySchema } from "./day.js";
import {
  CategoryIdSchema,
  PageLimitSchema,
  SearchTextSchema,
} from "./primitives.js";
import { ReportSummarySchema } from "./report-store.js";
import { CategorySuggestionSchema } from "./suggestion-store.js";

export const CursorPositionSchema = Schema.Struct({
  fingerprint: CursorFingerprintSchema,
  id: BankLineSchema.fields.id,
  occurredAt: BankLineSchema.fields.occurredAt,
});

export const CursorSchema = Schema.fromJsonString(CursorPositionSchema);

export const CursorTextSchema = Schema.String.check(Schema.isMaxLength(512));

export const cursorTextOf = (cursor: BankLineCursor): string =>
  Schema.encodeSync(CursorSchema)(cursor);

export const ListCategoriesInputSchema = Schema.Struct({
  limit: PageLimitSchema,
});

export const ListCategoriesOutputSchema = Schema.Struct({
  categories: Schema.Array(CategorySchema),
});

export const ListLinesInputSchema = Schema.Struct({
  categoryId: Schema.optional(CategoryIdSchema),
  cursor: Schema.optional(CursorSchema),
  from: Schema.optional(DaySchema),
  limit: PageLimitSchema,
  text: Schema.optional(SearchTextSchema),
  to: Schema.optional(DaySchema),
});

export const ListLinesOutputSchema = Schema.Struct({
  lines: Schema.Array(BankLineSchema),
  nextCursor: Schema.NullOr(CursorTextSchema),
  total: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export const GetLineInputSchema = Schema.Struct({
  lineId: BankLineSchema.fields.id,
});

export const GetLineOutputSchema = Schema.Struct({
  line: BankLineSchema,
});

export const ChooseCategoryInputSchema = Schema.Struct({
  categoryId: CategoryIdSchema,
  lineId: BankLineSchema.fields.id,
});

export const SuggestCategoryOutputSchema = Schema.Struct({
  suggestion: CategorySuggestionSchema,
});

export const ListReportsInputSchema = Schema.Struct({
  limit: PageLimitSchema,
});

export const ListReportsOutputSchema = Schema.Struct({
  reports: Schema.Array(ReportSummarySchema),
});
