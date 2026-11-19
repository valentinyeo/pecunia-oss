import type { Categorization, Category } from "@pecunia/core/model";
import { Effect, Match, Option } from "effect";

import { cycleOf, overflowOf } from "./errors.js";
import type { CategoryCycle, ReportOverflow } from "./errors.js";
import type { Flow } from "./flows.js";
import { spendFlows } from "./flows.js";
import type {
  CategoryId,
  CategoryReference,
  CategorySpend,
  SpendSplit,
  StackedMonth,
  YearMonth,
} from "./model.js";
import { CategoryReferenceSchema } from "./model.js";
import { compareText, minorOrOverflow, zeroShare } from "./money.js";
import type { ShareTarget } from "./shares.js";
import { allocateShares } from "./shares.js";

export interface CategoryTree {
  readonly byId: ReadonlyMap<CategoryId, Category>;
  readonly childrenOf: ReadonlyMap<CategoryId, readonly CategoryId[]>;
  readonly roots: readonly CategoryId[];
}

interface SpendTarget {
  readonly category: CategoryReference;
  readonly minor: bigint;
}

export const categorisedIdOf = (
  categorization: Categorization
): Option.Option<CategoryId> =>
  Match.value(categorization).pipe(
    Match.tag("Applied", ({ categoryId }) => Option.some(categoryId)),
    Match.tag("Confirmed", ({ categoryId }) => Option.some(categoryId)),
    Match.tag("Suggested", ({ categoryId }) => Option.some(categoryId)),
    Match.tag("None", () => Option.none<CategoryId>()),
    Match.exhaustive
  );

const cycleIn = (
  categories: readonly Category[]
): Option.Option<CategoryId> => {
  const parents = new Map<string, CategoryId>();

  for (const category of categories) {
    if (Option.isSome(category.parentId)) {
      parents.set(category.id, category.parentId.value);
    }
  }

  for (const category of categories) {
    const seen = new Set<string>();
    let current: CategoryId | undefined = category.id;

    while (current !== undefined) {
      if (seen.has(current)) {
        return Option.some(category.id);
      }

      seen.add(current);
      current = parents.get(current);
    }
  }

  return Option.none();
};

export const categoryTreeOf = (
  categories: readonly Category[]
): Effect.Effect<CategoryTree, CategoryCycle> => {
  const cycle = cycleIn(categories);

  if (Option.isSome(cycle)) {
    return Effect.fail(cycleOf(cycle.value));
  }

  const byId = new Map<CategoryId, Category>(
    categories.map((category) => [category.id, category])
  );

  const children = new Map<CategoryId, CategoryId[]>();
  const roots: CategoryId[] = [];

  for (const category of categories) {
    const parentId = Option.getOrUndefined(category.parentId);

    if (parentId === undefined || !byId.has(parentId)) {
      roots.push(category.id);
    } else {
      children.set(parentId, [...(children.get(parentId) ?? []), category.id]);
    }
  }

  return Effect.succeed({ byId, childrenOf: children, roots });
};

export const descendantsOf = (
  tree: CategoryTree,
  categoryId: CategoryId
): readonly CategoryId[] => {
  const found: CategoryId[] = [];
  const pending: CategoryId[] = [categoryId];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }

    found.push(current);
    pending.push(...(tree.childrenOf.get(current) ?? []));
  }

  return found;
};

export const namesOf = (
  categories: readonly Category[]
): ReadonlyMap<string, string> =>
  new Map(categories.map((category) => [category.id, category.name]));

const spentByCategoryOf = (
  flows: readonly Flow[]
): ReadonlyMap<CategoryId, bigint> => {
  const spend = new Map<CategoryId, bigint>();

  for (const flow of spendFlows(flows)) {
    const categoryId = Option.getOrUndefined(
      categorisedIdOf(flow.transaction.categorization)
    );

    if (categoryId !== undefined) {
      spend.set(
        categoryId,
        (spend.get(categoryId) ?? 0n) + BigInt(flow.amount.minor)
      );
    }
  }

  return spend;
};

export const uncategorisedOf = (flows: readonly Flow[]): bigint => {
  let total = 0n;

  for (const flow of spendFlows(flows)) {
    if (Option.isNone(categorisedIdOf(flow.transaction.categorization))) {
      total += BigInt(flow.amount.minor);
    }
  }

  return total;
};

export const rolledSpendOf = (
  tree: CategoryTree,
  own: ReadonlyMap<CategoryId, bigint>
): ReadonlyMap<CategoryId, bigint> => {
  const memo = new Map<CategoryId, bigint>();

  const rolled = (categoryId: CategoryId): bigint => {
    const cached = memo.get(categoryId);

    if (cached !== undefined) {
      return cached;
    }

    let total = own.get(categoryId) ?? 0n;

    for (const child of tree.childrenOf.get(categoryId) ?? []) {
      total += rolled(child);
    }

    memo.set(categoryId, total);

    return total;
  };

  for (const categoryId of tree.byId.keys()) {
    rolled(categoryId);
  }

  return memo;
};

const shareTargetsOf = (
  targets: readonly { readonly key: string; readonly minor: bigint }[]
): Effect.Effect<readonly ShareTarget[], ReportOverflow> =>
  Effect.gen(function* shareTargets() {
    const converted: ShareTarget[] = [];

    for (const target of targets) {
      converted.push({
        key: target.key,
        minor: yield* minorOrOverflow(
          target.minor,
          `the share of ${target.key}`
        ),
      });
    }

    return converted;
  });

const shareKeyOf = (category: CategoryReference): string =>
  Match.value(category).pipe(
    Match.tag("Categorised", ({ categoryId }) => categoryId),
    Match.tag("Uncategorised", () => "uncategorised"),
    Match.exhaustive
  );

const rolledTargetsOf = (
  tree: CategoryTree,
  flows: readonly Flow[]
): readonly SpendTarget[] => {
  const rolled = rolledSpendOf(tree, spentByCategoryOf(flows));
  const targets: SpendTarget[] = [];

  for (const categoryId of tree.roots) {
    const category = tree.byId.get(categoryId);

    const rolledMinor = rolled.get(categoryId) ?? 0n;

    if (category !== undefined && rolledMinor !== 0n) {
      targets.push({
        category: CategoryReferenceSchema.cases.Categorised.make({
          categoryId,
          name: category.name,
        }),
        minor: rolledMinor,
      });
    }
  }

  const uncategorised = uncategorisedOf(flows);

  if (uncategorised !== 0n) {
    targets.push({
      category: CategoryReferenceSchema.cases.Uncategorised.make({}),
      minor: uncategorised,
    });
  }

  return targets.toSorted((left, right) => {
    if (left.minor !== right.minor) {
      return left.minor > right.minor ? -1 : 1;
    }

    return compareText(shareKeyOf(left.category), shareKeyOf(right.category));
  });
};

const rowsOf = (
  targets: readonly SpendTarget[]
): Effect.Effect<readonly CategorySpend[], ReportOverflow> =>
  Effect.gen(function* categoryRows() {
    const shares = yield* allocateShares(
      yield* shareTargetsOf(
        targets.map((target) => ({
          key: shareKeyOf(target.category),
          minor: target.minor,
        }))
      )
    );

    const rows: CategorySpend[] = [];

    for (const target of targets) {
      const key = shareKeyOf(target.category);
      const share = shares.find((candidate) => candidate.key === key);

      if (share === undefined) {
        return yield* overflowOf(`the share of ${key}`);
      }

      rows.push({
        category: target.category,
        shareBasisPoints: share.shareBasisPoints,
        spendMinor: yield* minorOrOverflow(target.minor, `spend in ${key}`),
      });
    }

    return rows;
  });

export const categoryRowsOf = (
  tree: CategoryTree,
  flows: readonly Flow[]
): Effect.Effect<readonly CategorySpend[], ReportOverflow> =>
  rowsOf(rolledTargetsOf(tree, flows));

const splitOrder: readonly SpendSplit["bucket"][] = [
  "business",
  "mixed",
  "personal",
  "uncategorised",
];

export const spendSplitOf = (
  tree: CategoryTree,
  flows: readonly Flow[]
): Effect.Effect<readonly SpendSplit[], ReportOverflow> =>
  Effect.gen(function* spendSplitOfBook() {
    const totals = new Map<SpendSplit["bucket"], bigint>();

    for (const flow of spendFlows(flows)) {
      const categoryId = Option.getOrUndefined(
        categorisedIdOf(flow.transaction.categorization)
      );

      const category =
        categoryId === undefined ? undefined : tree.byId.get(categoryId);

      const bucket: SpendSplit["bucket"] =
        category === undefined ? "uncategorised" : category.spendingType;

      totals.set(
        bucket,
        (totals.get(bucket) ?? 0n) + BigInt(flow.amount.minor)
      );
    }

    const targets = splitOrder.map((bucket) => ({
      bucket,
      minor: totals.get(bucket) ?? 0n,
    }));

    const shares = yield* allocateShares(
      yield* shareTargetsOf(
        targets.map((target) => ({
          key: target.bucket,
          minor: target.minor,
        }))
      )
    );

    const sharesByBucket = new Map(
      shares.map((share) => [share.key, share.shareBasisPoints])
    );

    return yield* Effect.forEach([...targets], (target) =>
      Effect.map(
        minorOrOverflow(target.minor, `spend bucketed as ${target.bucket}`),
        (spendMinor) => ({
          bucket: target.bucket,
          shareBasisPoints: sharesByBucket.get(target.bucket) ?? zeroShare,
          spendMinor,
        })
      )
    );
  });

export const stackedMonthsOf = (
  tree: CategoryTree,
  flows: readonly Flow[],
  months: readonly YearMonth[]
): Effect.Effect<readonly StackedMonth[], ReportOverflow> =>
  Effect.gen(function* stackedMonths() {
    const stacked = yield* Effect.forEach([...months], (month) =>
      Effect.gen(function* stackedMonth() {
        const monthFlows = flows.filter(
          (flow) => flow.transaction.valueDate.slice(0, 7) === month
        );

        const targets = rolledTargetsOf(tree, monthFlows);
        let total = 0n;

        for (const target of targets) {
          total += target.minor;
        }

        const rows = yield* Effect.forEach([...targets], (target) =>
          Effect.map(
            minorOrOverflow(
              target.minor,
              `spend in ${shareKeyOf(target.category)} during ${month}`
            ),
            (spendMinor) => ({ category: target.category, spendMinor })
          )
        );

        return {
          month,
          rows,
          totalMinor: yield* minorOrOverflow(total, `spend during ${month}`),
        };
      })
    );

    return stacked;
  });

export const categoryCountOf = (categories: readonly Category[]): number =>
  categories.filter((category) => Option.isNone(category.archivedAt)).length;
