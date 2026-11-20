import {
  CategoryIdSchema,
  normalizeName,
  payeeForLine,
  ruleMatches,
  ruleOrder,
} from "@pecunia/categorize";
import type {
  CategorizeRule,
  CategoryId,
  MerchantAlias,
  MatchableLine,
  Payee,
  PayeeId,
} from "@pecunia/categorize";
import { Option, Schema } from "effect";

import { minorUnits } from "../money.js";
import type { Minor } from "../money.js";
import type { TimestampMillis } from "./ids.js";
import type { Payment } from "./payment.js";
import { monthLabel, monthOfMillis, monthsEndingAt } from "./period.js";
import type { Month } from "./period.js";
import { sharesOf } from "./shares.js";
import type { BasisPoints } from "./shares.js";
import type { CatalogSnapshot } from "./snapshot.js";
import { categorySpend } from "./tree.js";
import type { CategorySpend } from "./tree.js";

export const MerchantFilterSchema = Schema.TaggedUnion({
  All: {},
  Of: { categoryId: CategoryIdSchema },
  Uncategorised: {},
});

export type MerchantFilter = typeof MerchantFilterSchema.Type;

export const MERCHANT_LIMIT = 15;

export const MERCHANT_PAGE_SIZE = 5;

export interface MerchantRow {
  readonly awaiting: number;
  readonly categoryIds: readonly CategoryId[];
  readonly count: number;
  readonly coveringRule: Option.Option<CategorizeRule>;
  readonly key: string;
  readonly label: string;
  readonly latestAt: TimestampMillis;
  readonly payeeId: Option.Option<PayeeId>;
  readonly totalMinor: Minor;
  readonly uncategorised: number;
}

export interface CategorySpendRow extends CategorySpend {
  readonly share: Option.Option<BasisPoints>;
}

export interface CategorySlice {
  readonly category: Option.Option<CategoryId>;
  readonly label: string;
  readonly minor: Minor;
  readonly share: BasisPoints;
}

export interface MerchantMonth {
  readonly label: string;
  readonly minor: Minor;
  readonly month: Month;
}

export interface Paged<Item> {
  readonly items: readonly Item[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

export interface AliasGroup {
  readonly aliases: readonly MerchantAlias[];
  readonly payee: Payee;
}

export interface AliasCandidate {
  readonly label: string;
  readonly payeeId: Option.Option<PayeeId>;
}

export const lineOf = (payment: Payment): MatchableLine => ({
  description: payment.description,
  direction: payment.direction,
  merchant: payment.merchant,
  minorAmount: payment.amountMinor,
  reference: payment.reference,
});

const merchantAsLine = (merchant: string): MatchableLine => ({
  description: "",
  direction: "out",
  merchant,
  minorAmount: minorUnits(0),
  reference: "",
});

export const hasMerchant = (payment: Payment): boolean =>
  payment.merchant.trim().length > 0;

const findPayee = (
  snapshot: CatalogSnapshot,
  payeeId: PayeeId
): Option.Option<Payee> =>
  Option.fromNullishOr(snapshot.payees.find((payee) => payee.id === payeeId));

const namedPayee = (
  snapshot: CatalogSnapshot,
  merchant: string
): Option.Option<Payee> => {
  const name = normalizeName(merchant);

  return Option.fromNullishOr(
    snapshot.payees.find((payee) => payee.normalizedName === name)
  );
};

export const payeeOfMerchant = (
  snapshot: CatalogSnapshot,
  merchant: string
): Option.Option<Payee> =>
  Option.flatMap(
    payeeForLine(merchantAsLine(merchant), snapshot.aliases),
    (payeeId) => findPayee(snapshot, payeeId)
  );

export const payeeForName = (
  snapshot: CatalogSnapshot,
  merchant: string
): Option.Option<Payee> => {
  const named = namedPayee(snapshot, merchant);

  return Option.isSome(named) ? named : payeeOfMerchant(snapshot, merchant);
};

export const merchantKeyOf = (
  snapshot: CatalogSnapshot,
  merchant: string
): string =>
  Option.match(payeeForName(snapshot, merchant), {
    onNone: () => `name:${normalizeName(merchant)}`,
    onSome: (payee) => `payee:${payee.id}`,
  });

const spendOf = (payment: Payment): Minor =>
  payment.direction === "out" ? payment.amountMinor : minorUnits(0);

interface Group {
  readonly categoryIds: CategoryId[];
  awaiting: number;
  count: number;
  label: string;
  latestAt: TimestampMillis;
  readonly payments: Payment[];
  readonly payeeId: Option.Option<PayeeId>;
  totalMinor: number;
  uncategorised: number;
}

const newGroup = (
  snapshot: CatalogSnapshot,
  payment: Payment,
  payeeId: Option.Option<PayeeId>
): Group => ({
  awaiting: 0,
  categoryIds: [],
  count: 0,
  label: Option.match(payeeId, {
    onNone: () => payment.merchant.trim(),
    onSome: (id) =>
      Option.match(findPayee(snapshot, id), {
        onNone: () => payment.merchant.trim(),
        onSome: (payee) => payee.name,
      }),
  }),
  latestAt: payment.occurredAt,
  payments: [],
  payeeId,
  totalMinor: 0,
  uncategorised: 0,
});

const addToGroup = (group: Group, payment: Payment): void => {
  group.count += 1;
  group.totalMinor += spendOf(payment);
  group.latestAt =
    payment.occurredAt > group.latestAt ? payment.occurredAt : group.latestAt;
  group.awaiting += payment.reviewed ? 0 : 1;
  group.payments.push(payment);

  if (payment.categoryId === null) {
    group.uncategorised += 1;
  } else if (!group.categoryIds.includes(payment.categoryId)) {
    group.categoryIds.push(payment.categoryId);
  }
};

const coveringRule = (
  rules: readonly CategorizeRule[],
  payments: readonly Payment[]
): Option.Option<CategorizeRule> =>
  Option.fromNullishOr(
    rules
      .filter((rule) => rule.enabled)
      .toSorted(ruleOrder)
      .find((rule) =>
        payments.some((payment) => ruleMatches(rule, lineOf(payment)))
      )
  );

export const merchantRows = (
  snapshot: CatalogSnapshot
): readonly MerchantRow[] => {
  const groups = new Map<string, Group>();

  for (const payment of snapshot.payments) {
    if (!hasMerchant(payment)) {
      continue;
    }

    const key = merchantKeyOf(snapshot, payment.merchant);
    const existing = groups.get(key);

    if (existing === undefined) {
      groups.set(
        key,
        newGroup(
          snapshot,
          payment,
          Option.map(
            payeeForName(snapshot, payment.merchant),
            (payee) => payee.id
          )
        )
      );
    }

    const group = groups.get(key);

    if (group !== undefined) {
      addToGroup(group, payment);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      awaiting: group.awaiting,
      categoryIds: group.categoryIds,
      count: group.count,
      coveringRule: coveringRule(snapshot.rules, group.payments),
      key,
      label: group.label,
      latestAt: group.latestAt,
      payeeId: group.payeeId,
      totalMinor: minorUnits(group.totalMinor),
      uncategorised: group.uncategorised,
    }))
    .toSorted((left, right) =>
      right.totalMinor === left.totalMinor
        ? left.label.localeCompare(right.label)
        : right.totalMinor - left.totalMinor
    );
};

export const filterMerchants = (
  rows: readonly MerchantRow[],
  filter: MerchantFilter
): readonly MerchantRow[] =>
  MerchantFilterSchema.match(filter, {
    All: () => rows,
    Of: ({ categoryId }) =>
      rows.filter((row) => row.categoryIds.includes(categoryId)),
    Uncategorised: () => rows.filter((row) => row.uncategorised > 0),
  });

export const listedMerchants = (
  rows: readonly MerchantRow[],
  limit: number = MERCHANT_LIMIT
): readonly MerchantRow[] => rows.slice(0, limit);

export const merchantRowOf = (
  rows: readonly MerchantRow[],
  key: string
): Option.Option<MerchantRow> =>
  Option.fromNullishOr(rows.find((row) => row.key === key));

export const paymentsForMerchant = (
  snapshot: CatalogSnapshot,
  key: string
): readonly Payment[] =>
  snapshot.payments
    .filter(
      (payment) =>
        hasMerchant(payment) &&
        merchantKeyOf(snapshot, payment.merchant) === key
    )
    .toSorted((left, right) =>
      right.occurredAt === left.occurredAt
        ? left.id.localeCompare(right.id)
        : right.occurredAt - left.occurredAt
    );

export const ownSpendByCategory = (
  payments: readonly Payment[]
): ReadonlyMap<CategoryId, Minor> => {
  const totals = new Map<CategoryId, number>();

  for (const payment of payments) {
    if (payment.categoryId === null || payment.direction !== "out") {
      continue;
    }

    totals.set(
      payment.categoryId,
      (totals.get(payment.categoryId) ?? 0) + payment.amountMinor
    );
  }

  return new Map(
    [...totals.entries()].map(([id, total]) => [id, minorUnits(total)])
  );
};

const shareByCategory = (
  rows: readonly CategorySpend[]
): ReadonlyMap<string, BasisPoints> => {
  const roots = rows.filter((row) => row.depth === 0);
  const shares = sharesOf(roots.map((root) => root.totalMinor));

  return new Map(
    roots.map((root, index) => [root.category.id, shares[index] ?? 0])
  );
};

export const spendByCategory = (
  snapshot: CatalogSnapshot,
  month: Month
): readonly CategorySpendRow[] => {
  const payments = snapshot.payments.filter(
    (payment) => monthOfMillis(payment.occurredAt) === month
  );

  const rows = categorySpend(snapshot.categories, ownSpendByCategory(payments));
  const shares = shareByCategory(rows);

  return rows.map((row) => ({
    ...row,
    share:
      row.depth === 0
        ? Option.some(shares.get(row.category.id) ?? 0)
        : Option.none(),
  }));
};

export const monthsOf = (snapshot: CatalogSnapshot): readonly Month[] =>
  [
    ...new Set(
      snapshot.payments.map((payment) => monthOfMillis(payment.occurredAt))
    ),
  ]
    .toSorted()
    .toReversed();

export const categoryCount = (snapshot: CatalogSnapshot): number =>
  snapshot.categories.length;

export const categoryName = (
  snapshot: CatalogSnapshot,
  categoryId: CategoryId
): Option.Option<string> =>
  Option.map(
    Option.fromNullishOr(
      snapshot.categories.find((category) => category.id === categoryId)
    ),
    (category) => category.name
  );

export const merchantSpendByCategory = (
  snapshot: CatalogSnapshot,
  key: string
): readonly CategorySlice[] => {
  const payments = paymentsForMerchant(snapshot, key);
  const rows = categorySpend(snapshot.categories, ownSpendByCategory(payments));

  const unfiled = payments.filter(
    (payment) => payment.categoryId === null && payment.direction === "out"
  );

  type Slice = Omit<CategorySlice, "share">;

  const filed: readonly Slice[] = rows
    .filter((row) => row.ownMinor > 0)
    .map((row) => ({
      category: Option.some(row.category.id),
      label: row.category.name,
      minor: row.ownMinor,
    }));

  const unfiledSlice: readonly Slice[] =
    unfiled.length === 0
      ? []
      : [
          {
            category: Option.none<CategoryId>(),
            label: "Uncategorised",
            minor: minorUnits(
              unfiled.reduce((sum, payment) => sum + payment.amountMinor, 0)
            ),
          },
        ];

  const slices: readonly Slice[] = [...filed, ...unfiledSlice];

  const ordered = slices.toSorted((left, right) =>
    right.minor === left.minor
      ? left.label.localeCompare(right.label)
      : right.minor - left.minor
  );

  const shares = sharesOf(ordered.map((slice) => slice.minor));

  return ordered.map((slice, index) => ({
    ...slice,
    share: shares[index] ?? 0,
  }));
};

export const merchantMonthlySpend = (
  snapshot: CatalogSnapshot,
  key: string,
  through: Month,
  count: number
): readonly MerchantMonth[] => {
  const payments = paymentsForMerchant(snapshot, key);

  return monthsEndingAt(through, count).map((month) => ({
    label: monthLabel(month),
    minor: minorUnits(
      payments
        .filter((payment) => monthOfMillis(payment.occurredAt) === month)
        .reduce((sum, payment) => sum + spendOf(payment), 0)
    ),
    month,
  }));
};

export const paged = <Item>(
  items: readonly Item[],
  page: number,
  size: number = MERCHANT_PAGE_SIZE
): Paged<Item> => {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * size;

  return {
    items: items.slice(start, start + size),
    page: current,
    pageCount,
    total: items.length,
  };
};

export const aliasGroups = (snapshot: CatalogSnapshot): readonly AliasGroup[] =>
  snapshot.payees
    .map((payee) => ({
      aliases: snapshot.aliases
        .filter((alias) => alias.payeeId === payee.id)
        .toSorted((left, right) => left.pattern.localeCompare(right.pattern)),
      payee,
    }))
    .toSorted((left, right) => left.payee.name.localeCompare(right.payee.name));

export const aliasCandidates = (
  snapshot: CatalogSnapshot,
  query: string,
  limit = 6
): readonly AliasCandidate[] => {
  const text = normalizeName(query);

  const ownerNames = new Set(
    snapshot.payees.map((payee) => payee.normalizedName)
  );

  const seen = new Set<string>();
  const free: AliasCandidate[] = [];

  for (const payment of snapshot.payments) {
    if (!hasMerchant(payment)) {
      continue;
    }

    const label = payment.merchant.trim();
    const name = normalizeName(label);

    if (ownerNames.has(name) || seen.has(name)) {
      continue;
    }

    seen.add(name);
    free.push({ label, payeeId: Option.none<PayeeId>() });
  }

  const payees: readonly AliasCandidate[] = snapshot.payees.map((payee) => ({
    label: payee.name,
    payeeId: Option.some(payee.id),
  }));

  return [...payees, ...free]
    .filter(
      (candidate) =>
        text.length === 0 || normalizeName(candidate.label).includes(text)
    )
    .toSorted((left, right) =>
      normalizeName(left.label).localeCompare(normalizeName(right.label))
    )
    .slice(0, limit);
};
