import type { BankLineService, BankLineStore } from "@pecunia/bank-lines";
import { Option } from "effect";

import type { ToolCaller } from "./caller.js";
import {
  confirmCategory,
  getLine,
  listCategories,
  listLines,
  listReports,
  suggestCategory,
} from "./capabilities.js";
import type { CategoryStore } from "./category-store.js";
import type { ReportStore } from "./report-store.js";
import type { SuggestionStore } from "./suggestion-store.js";
import { toolOf } from "./tool.js";
import type { ToolDefinition } from "./tool.js";

export type ToolPorts =
  | BankLineService
  | BankLineStore
  | CategoryStore
  | ReportStore
  | SuggestionStore
  | ToolCaller;

export const ToolCatalog: readonly ToolDefinition<ToolPorts>[] = [
  toolOf(listCategories),
  toolOf(listLines),
  toolOf(getLine),
  toolOf(suggestCategory),
  toolOf(confirmCategory),
  toolOf(listReports),
];

export const toolNamed = (
  catalog: readonly ToolDefinition<ToolPorts>[],
  name: string
): Option.Option<ToolDefinition<ToolPorts>> => {
  const found = catalog.find((tool) => tool.name === name);

  return found === undefined ? Option.none() : Option.some(found);
};
