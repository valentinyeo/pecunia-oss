import { defineContract } from "@pecunia/capability/contract";

import {
  ChooseCategoryInputSchema,
  GetLineInputSchema,
  GetLineOutputSchema,
  ListCategoriesInputSchema,
  ListCategoriesOutputSchema,
  ListLinesInputSchema,
  ListLinesOutputSchema,
  ListReportsInputSchema,
  ListReportsOutputSchema,
  SuggestCategoryOutputSchema,
} from "./model.js";
import { ToolFailureSchema } from "./refusal.js";

export const listCategoriesContract = defineContract("list_categories", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List the acting profile's categories, archived ones included, ordered by name then id, at most 200.",
  failure: ToolFailureSchema,
  input: ListCategoriesInputSchema,
  output: ListCategoriesOutputSchema,
});

export const listLinesContract = defineContract("list_lines", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List the acting profile's bank lines newest first, with an optional day range, category, text match, limit of 1 to 200 and keyset cursor. Amounts are integer minor units.",
  failure: ToolFailureSchema,
  input: ListLinesInputSchema,
  output: ListLinesOutputSchema,
});

export const getLineContract = defineContract("get_line", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "Read one bank line of the acting profile by id, including its category and review state.",
  failure: ToolFailureSchema,
  input: GetLineInputSchema,
  output: GetLineOutputSchema,
});

export const suggestCategoryContract = defineContract("suggest_category", {
  annotations: { idempotent: true },
  description:
    "Store a category suggestion on one of the acting profile's bank lines. A suggestion never becomes a confirmed category.",
  failure: ToolFailureSchema,
  input: ChooseCategoryInputSchema,
  output: SuggestCategoryOutputSchema,
});

export const confirmCategoryContract = defineContract("confirm_category", {
  annotations: { idempotent: true },
  description:
    "Confirm one bank line of the acting profile as a person-confirmed category. Only this tool writes a confirmed category.",
  failure: ToolFailureSchema,
  input: ChooseCategoryInputSchema,
  output: GetLineOutputSchema,
});

export const listReportsContract = defineContract("list_reports", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List the acting profile's saved report summaries newest first, without their HTML, at most 200.",
  failure: ToolFailureSchema,
  input: ListReportsInputSchema,
  output: ListReportsOutputSchema,
});

export const aiToolContracts = [
  listCategoriesContract,
  listLinesContract,
  getLineContract,
  suggestCategoryContract,
  confirmCategoryContract,
  listReportsContract,
] as const;

export const TOOL_NAMES = [
  "list_categories",
  "list_lines",
  "get_line",
  "suggest_category",
  "confirm_category",
  "list_reports",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];
