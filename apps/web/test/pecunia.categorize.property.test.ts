import { describe, expect, it } from "@effect/vitest";
import {
  CategorySchema,
  PayeeIdSchema,
  ProfileIdSchema,
  normalizeName,
} from "@pecunia/categorize";
import type { Category, CategoryId } from "@pecunia/categorize";
import { Result, Schema } from "effect";

import {
  majorTextOf,
  parseMajorText,
} from "../src/client/pecunia/categorize/amount.js";
import {
  merchantRows,
  paymentsForMerchant,
} from "../src/client/pecunia/categorize/catalog.js";
import {
  PaymentIdSchema,
  TimestampMillisSchema,
  uuidV7At,
} from "../src/client/pecunia/categorize/ids.js";
import type { TimestampMillis } from "../src/client/pecunia/categorize/ids.js";
import { BookCurrency } from "../src/client/pecunia/categorize/payment.js";
import type { Payment } from "../src/client/pecunia/categorize/payment.js";
import {
  MonthSchema,
  addMonths,
  endOfMonth,
  monthOfMillis,
  startOfMonth,
} from "../src/client/pecunia/categorize/period.js";
import { sharesOf } from "../src/client/pecunia/categorize/shares.js";
import type { CatalogSnapshot } from "../src/client/pecunia/categorize/snapshot.js";
import {
  categorySpend,
  descendantIds,
} from "../src/client/pecunia/categorize/tree.js";
import { minorUnits } from "../src/client/pecunia/money.js";
import type { Minor } from "../src/client/pecunia/money.js";

const CASES = 500;

const seeded = (seed: number) => {
  let state = seed;

  return (bound: number): number => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return Math.floor((state / 4_294_967_296) * bound);
  };
};

const profileId = Schema.decodeSync(ProfileIdSchema)(
  "0197a000-0000-7a00-8a00-000000000001"
);

const randomMillis = (draw: (bound: number) => number): TimestampMillis =>
  Schema.decodeSync(TimestampMillisSchema)(
    946_684_800_000 + draw(2_500_000_000_000)
  );

const moments = Array.from({ length: CASES }, (_, seed) => {
  const draw = seeded(seed + 1);
  const millis = randomMillis(draw);

  return { millis, month: monthOfMillis(millis) };
});

describe("payment and row ids", () => {
  it("generates ids the brands accept", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const draw = seeded(seed + 11);
      const id = uuidV7At(1_700_000_000_000 + draw(1_000_000_000), draw(4096));

      expect(Schema.is(PaymentIdSchema)(id)).toBe(true);
      expect(Schema.is(PayeeIdSchema)(id)).toBe(true);
    }
  });

  it("never repeats an id made at the same moment", () => {
    const ids = new Set<string>();

    for (let counter = 0; counter < CASES; counter += 1) {
      ids.add(uuidV7At(1_767_225_600_000, counter));
    }

    expect(ids.size).toBe(CASES);
  });

  it("sorts ids by the moment they were made", () => {
    const ids = Array.from({ length: CASES }, (_, index) => {
      const draw = seeded(index + 21);

      return uuidV7At(1_600_000_000_000 + index * 1000 + draw(1000), 7);
    });

    expect([...ids].toSorted()).toStrictEqual(ids);
  });
});

describe("months over a range", () => {
  it("reads the month a moment belongs to", () => {
    for (const { millis, month } of moments) {
      expect(Schema.is(MonthSchema)(month)).toBe(true);
      expect(millis >= startOfMonth(month)).toBe(true);
      expect(millis <= endOfMonth(month)).toBe(true);
    }
  });

  it("surrounds a month with its own start and end", () => {
    for (const { month } of moments) {
      expect(monthOfMillis(startOfMonth(month))).toBe(month);
      expect(monthOfMillis(endOfMonth(month))).toBe(month);
      expect(startOfMonth(addMonths(month, 1))).toBe(endOfMonth(month) + 1);
    }
  });

  it("puts every moment in exactly one month", () => {
    for (const { millis, month } of moments) {
      const following = startOfMonth(addMonths(month, 1));

      expect(millis >= startOfMonth(month) && millis < following).toBe(true);
    }
  });
});

const amountsFor = (seed: number): readonly Minor[] => {
  const draw = seeded(seed + 31);
  const count = 1 + draw(12);

  return Array.from({ length: count }, () => minorUnits(draw(10_000_000)));
};

describe("shares of a total", () => {
  it("hands out exactly one hundred percent", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const shares = sharesOf(amountsFor(seed));

      expect(shares.reduce((sum, share) => sum + share, 0)).toBe(10_000);
    }
  });

  it("gives each row its exact share, rounded to one basis point", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const amounts = amountsFor(seed);
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      const shares = sharesOf(amounts);

      for (const [index, amount] of amounts.entries()) {
        const exact = (amount * 10_000) / total;
        const share = shares[index] ?? 0;

        expect(share).toBeGreaterThanOrEqual(Math.floor(exact));
        expect(share).toBeLessThanOrEqual(Math.ceil(exact));
      }
    }
  });

  it("never gives a bigger share to a smaller amount", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const amounts = amountsFor(seed);
      const shares = sharesOf(amounts);

      for (const [first, left] of amounts.entries()) {
        for (const [second, right] of amounts.entries()) {
          if (left > right) {
            expect(shares[first] ?? 0).toBeGreaterThanOrEqual(
              shares[second] ?? 0
            );
          }
        }
      }
    }
  });

  it("splits nothing when there is nothing to split", () => {
    expect(sharesOf([])).toStrictEqual([]);
    expect(sharesOf([minorUnits(0), minorUnits(0)])).toStrictEqual([0, 0]);
  });
});

interface ForestRow {
  readonly category: Category;
  readonly own: Minor;
}

const forestFor = (seed: number): readonly ForestRow[] => {
  const draw = seeded(seed + 41);
  const count = 1 + draw(12);

  return Array.from({ length: count }, (_, index) => {
    const parent = index === 0 ? null : draw(index);

    return {
      category: Schema.decodeSync(CategorySchema)({
        archived: false,
        color: "#0f766e",
        id: uuidV7At(1_700_000_000_000, index),
        name: `Category ${index}`,
        parentId: parent === null ? null : uuidV7At(1_700_000_000_000, parent),
        profileId,
        spendingType: "personal",
      }),
      own: minorUnits(draw(1_000_000)),
    };
  });
};

const ancestorsOf = (
  categories: readonly Category[],
  id: CategoryId
): ReadonlySet<string> => {
  const byId = new Map(categories.map((row) => [row.id, row] as const));
  const chain = new Set<string>();
  let cursor = byId.get(id);

  while (cursor !== undefined && cursor.parentId !== null) {
    if (chain.has(cursor.parentId)) {
      break;
    }

    chain.add(cursor.parentId);
    cursor = byId.get(cursor.parentId);
  }

  return chain;
};

describe("a category tree over a range", () => {
  it("lists every category once and takes children into their parent's total", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const forest = forestFor(seed);
      const categories = forest.map((row) => row.category);

      const own = new Map(
        forest.map((row) => [row.category.id, row.own] as const)
      );

      const rows = categorySpend(categories, own);

      expect(rows).toHaveLength(forest.length);
      expect(new Set(rows.map((row) => row.category.id)).size).toBe(
        forest.length
      );

      for (const row of rows) {
        const below = descendantIds(categories, row.category.id).reduce(
          (sum, id) => sum + (own.get(id) ?? 0),
          0
        );

        expect(row.totalMinor).toBe(row.ownMinor + below);
        expect(row.totalMinor).toBeGreaterThanOrEqual(row.ownMinor);
      }

      const roots = rows.filter((row) => row.depth === 0);

      expect(roots.reduce((sum, row) => sum + row.totalMinor, 0)).toBe(
        forest.reduce((sum, row) => sum + row.own, 0)
      );
    }
  });

  it("moves each ancestor by exactly what one category gains", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const forest = forestFor(seed);
      const categories = forest.map((row) => row.category);

      const own = new Map(
        forest.map((row) => [row.category.id, row.own] as const)
      );

      const target = forest.at(-1);
      const gain = minorUnits(1 + seed);

      if (target === undefined) {
        continue;
      }

      const raised = new Map([
        ...own,
        [target.category.id, minorUnits(target.own + gain)] as const,
      ]);

      const before = categorySpend(categories, own);
      const after = categorySpend(categories, raised);

      const touched = new Set<string>([
        ...ancestorsOf(categories, target.category.id),
        target.category.id,
      ]);

      for (const [index, row] of before.entries()) {
        const next = after[index];

        expect(next?.totalMinor).toBe(
          touched.has(row.category.id) ? row.totalMinor + gain : row.totalMinor
        );
      }
    }
  });
});

const merchantNames = [
  "Demo Grocer",
  "THE DEMO COFFEE SHOP",
  "Demo Coffee",
  "Example Ltd",
  "",
] as const;

const paymentsFor = (seed: number): readonly Payment[] => {
  const draw = seeded(seed + 51);

  return Array.from({ length: 1 + draw(24) }, (_, index) => ({
    amountMinor: minorUnits(draw(50_000)),
    categoryId: null,
    currency: BookCurrency,
    description: "Payment",
    direction: "out" as const,
    id: Schema.decodeSync(PaymentIdSchema)(
      uuidV7At(1_700_000_000_000, seed * 100 + index)
    ),
    merchant: merchantNames[draw(merchantNames.length)] ?? "",
    occurredAt: Schema.decodeSync(TimestampMillisSchema)(
      1_700_000_000_000 + draw(1_000_000_000)
    ),
    reference: "",
    reviewed: draw(2) === 1,
    source: "rule" as const,
  }));
};

const coffeePayeeId = Schema.decodeSync(PayeeIdSchema)(
  uuidV7At(1_700_000_000_000, 998)
);

const snapshotOf = (payments: readonly Payment[]): CatalogSnapshot => ({
  aliases: [
    {
      id: Schema.decodeSync(
        Schema.NonEmptyString.check(Schema.isMaxLength(64)).pipe(
          Schema.brand("AliasId")
        )
      )(uuidV7At(1_700_000_000_000, 999)),
      matchType: "contains",
      pattern: "coffee shop",
      payeeId: coffeePayeeId,
      profileId,
    },
  ],
  categories: [],
  payees: [
    {
      archived: false,
      defaultCategoryId: null,
      id: coffeePayeeId,
      kind: "merchant",
      name: "Demo Coffee",
      normalizedName: normalizeName("Demo Coffee"),
      profileId,
    },
  ],
  payments,
  profileId,
  rules: [],
});

describe("merchants over a range", () => {
  it("counts and totals every payment exactly once", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const payments = paymentsFor(seed);
      const catalog = snapshotOf(payments);
      const rows = merchantRows(catalog);

      const withMerchant = payments.filter(
        (payment) => payment.merchant.trim().length > 0
      );

      expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(
        withMerchant.length
      );
      expect(rows.reduce((sum, row) => sum + row.totalMinor, 0)).toBe(
        withMerchant.reduce((sum, payment) => sum + payment.amountMinor, 0)
      );

      for (const row of rows) {
        const owned = paymentsForMerchant(catalog, row.key);

        expect(owned).toHaveLength(row.count);
        expect(row.totalMinor).toBe(
          owned.reduce((sum, payment) => sum + payment.amountMinor, 0)
        );
        expect(row.latestAt).toBe(
          Math.max(...owned.map((payment) => payment.occurredAt))
        );
      }
    }
  });

  it("groups the merchant names one alias means into one merchant", () => {
    let checked = 0;

    for (let seed = 0; seed < CASES; seed += 1) {
      const payments = paymentsFor(seed);
      const rows = merchantRows(snapshotOf(payments));

      const coffee = payments.filter((payment) =>
        normalizeName(payment.merchant).includes("demo-coffee")
      );

      if (coffee.length === 0) {
        continue;
      }

      checked += 1;

      expect(rows.filter((row) => row.label === "Demo Coffee")).toHaveLength(1);
      expect(rows.find((row) => row.label === "Demo Coffee")?.count).toBe(
        coffee.length
      );
    }

    expect(checked).toBeGreaterThan(0);
  });

  it("lists merchants by spend, largest first", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const rows = merchantRows(snapshotOf(paymentsFor(seed)));

      for (const [index, row] of rows.entries()) {
        const next = rows[index + 1];

        if (next !== undefined) {
          expect(row.totalMinor).toBeGreaterThanOrEqual(next.totalMinor);
        }
      }
    }
  });
});

describe("the amount boundary", () => {
  it("reads back every amount it writes", () => {
    for (let seed = 0; seed < CASES; seed += 1) {
      const draw = seeded(seed + 61);
      const minor = minorUnits(draw(100_000_000));
      const parsed = parseMajorText(majorTextOf(minor));

      expect(Result.isSuccess(parsed) ? parsed.success : -1).toBe(minor);
    }
  });

  it("reads plain and short decimals as the same amount", () => {
    const fiftyFifty = minorUnits(5050);

    expect(parseMajorText("50")).toStrictEqual(
      Result.succeed(minorUnits(5000))
    );
    expect(parseMajorText("50.5")).toStrictEqual(Result.succeed(fiftyFifty));
    expect(parseMajorText("50.50")).toStrictEqual(Result.succeed(fiftyFifty));
    expect(parseMajorText("0.07")).toStrictEqual(Result.succeed(minorUnits(7)));
  });

  it("refuses anything that is not a whole positive amount", () => {
    for (const text of [
      "",
      " ",
      "-1",
      "1,50",
      "12.345",
      "1e3",
      "fifty",
      ".50",
      "50.",
    ]) {
      expect(Result.isFailure(parseMajorText(text))).toBe(true);
    }
  });
});
