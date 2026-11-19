import type { Category } from "@pecunia/categorize";

import type { ReportSummary } from "./report-store.js";

const compareText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

export const categoriesByName = (
  categories: readonly Category[]
): readonly Category[] =>
  categories.toSorted(
    (left, right) =>
      compareText(left.name, right.name) || compareText(left.id, right.id)
  );

export const reportsByNewest = (
  reports: readonly ReportSummary[]
): readonly ReportSummary[] =>
  reports.toSorted(
    (left, right) =>
      right.updatedAt - left.updatedAt || compareText(left.slug, right.slug)
  );

export const take = <A>(values: readonly A[], limit: number): readonly A[] =>
  values.slice(0, limit);
