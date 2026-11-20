import type { Category, CategoryId } from "@pecunia/categorize";
import { Option, Schema } from "effect";

import { minorUnits } from "../money.js";
import type { Minor } from "../money.js";

export const ParentProblem = Schema.TaggedUnion({
  Cycle: { parentName: Schema.NonEmptyString },
  Self: {},
  Unknown: {},
});

export type ParentProblemValue = typeof ParentProblem.Type;

export interface CategoryRow {
  readonly category: Category;
  readonly depth: number;
}

export interface CategorySpend extends CategoryRow {
  readonly ownMinor: Minor;
  readonly totalMinor: Minor;
}

const byName = (left: Category, right: Category): number =>
  left.name.localeCompare(right.name);

const childrenByParent = (
  categories: readonly Category[]
): ReadonlyMap<string, readonly Category[]> => {
  const children = new Map<string, Category[]>();

  for (const category of categories) {
    const { parentId } = category;

    if (parentId === null) {
      continue;
    }

    children.set(parentId, [...(children.get(parentId) ?? []), category]);
  }

  return children;
};

export const directChildrenOf = (
  categories: readonly Category[],
  categoryId: CategoryId
): readonly Category[] =>
  (childrenByParent(categories).get(categoryId) ?? []).toSorted(byName);

const rootsOf = (categories: readonly Category[]): readonly Category[] => {
  const ids = new Set<string>(categories.map((category) => category.id));

  return categories
    .filter(
      (category) => category.parentId === null || !ids.has(category.parentId)
    )
    .toSorted(byName);
};

export const categoryRows = (
  categories: readonly Category[]
): readonly CategoryRow[] => {
  const children = childrenByParent(categories);
  const rows: CategoryRow[] = [];
  const seen = new Set<string>();

  const visit = (category: Category, depth: number): void => {
    if (seen.has(category.id)) {
      return;
    }

    seen.add(category.id);
    rows.push({ category, depth });

    for (const child of (children.get(category.id) ?? []).toSorted(byName)) {
      visit(child, depth + 1);
    }
  };

  for (const root of rootsOf(categories)) {
    visit(root, 0);
  }

  for (const category of categories.toSorted(byName)) {
    visit(category, 0);
  }

  return rows;
};

export const descendantIds = (
  categories: readonly Category[],
  categoryId: CategoryId
): readonly CategoryId[] => {
  const children = childrenByParent(categories);
  const found: CategoryId[] = [];
  const seen = new Set<string>([categoryId]);

  const visit = (id: string): void => {
    for (const child of children.get(id) ?? []) {
      if (seen.has(child.id)) {
        continue;
      }

      seen.add(child.id);
      found.push(child.id);
      visit(child.id);
    }
  };

  visit(categoryId);

  return found;
};

export const checkParent = (
  categories: readonly Category[],
  claim: Readonly<{
    categoryId: Option.Option<CategoryId>;
    parentId: Option.Option<CategoryId>;
  }>
): Option.Option<ParentProblemValue> =>
  Option.match(claim.parentId, {
    onNone: () => Option.none(),
    onSome: (parentId) => {
      const parent = categories.find((category) => category.id === parentId);

      if (parent === undefined) {
        return Option.some(ParentProblem.cases.Unknown.make({}));
      }

      if (Option.isSome(claim.categoryId)) {
        const own = Option.getOrThrow(claim.categoryId);

        if (own === parentId) {
          return Option.some(ParentProblem.cases.Self.make({}));
        }

        if (descendantIds(categories, own).includes(parentId)) {
          return Option.some(
            ParentProblem.cases.Cycle.make({ parentName: parent.name })
          );
        }
      }

      return Option.none();
    },
  });

export const categorySpend = (
  categories: readonly Category[],
  ownSpend: ReadonlyMap<CategoryId, Minor>
): readonly CategorySpend[] => {
  const rows = categoryRows(categories);
  const totals = new Map<string, number>();

  for (const row of rows) {
    totals.set(row.category.id, ownSpend.get(row.category.id) ?? 0);
  }

  for (const row of rows.toReversed()) {
    const { parentId } = row.category;

    if (parentId === null) {
      continue;
    }

    const own = totals.get(row.category.id) ?? 0;
    const parent = totals.get(parentId);

    if (parent !== undefined) {
      totals.set(parentId, parent + own);
    }
  }

  return rows.map((row) => ({
    category: row.category,
    depth: row.depth,
    ownMinor: minorUnits(ownSpend.get(row.category.id) ?? 0),
    totalMinor: minorUnits(totals.get(row.category.id) ?? 0),
  }));
};
