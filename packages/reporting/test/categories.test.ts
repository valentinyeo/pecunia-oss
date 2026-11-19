import { expect, it } from "@effect/vitest";
import { Effect, Option, Predicate } from "effect";

import {
  categoryCountOf,
  categoryRowsOf,
  categoryTreeOf,
  descendantsOf,
  rolledSpendOf,
  spendSplitOf,
} from "../src/categories.js";
import { countedFlows, flowsOf, totalsOf } from "../src/flows.js";
import type { CategoryId } from "../src/model.js";
import type { LineSeed } from "./fixtures.js";
import {
  CASES,
  categoryOf,
  currencyOf,
  minorUnits,
  seeded,
  transactionOf,
  uuidOf,
} from "./fixtures.js";

const draw = seeded(4_242_424);

const spendLine = (
  id: number,
  categoryId: string,
  minor: number
): LineSeed => ({
  categoryId,
  direction: "out",
  id,
  minor,
  valueDate: "2024-03-10",
});

const sumOfRows = (rows: readonly { readonly spendMinor: number }[]): number =>
  rows.reduce((total, row) => total + row.spendMinor, 0);

it.effect(
  "a parent carries its children's spend, and the roots add up to the whole spend",
  () =>
    Effect.gen(function* rollUp() {
      for (let index = 0; index < CASES; index += 1) {
        const roots = 1 + draw(4);
        const categories = [];
        const lines: LineSeed[] = [];
        let lineId = 1;

        for (let root = 0; root < roots; root += 1) {
          const rootId = uuidOf(100 + root);
          const rootMinor = draw(50_000);

          categories.push(categoryOf(rootId, `Root ${root}`, "personal", null));
          lines.push(spendLine(lineId, rootId, rootMinor));
          lineId += 1;

          const children = draw(3);

          for (let child = 0; child < children; child += 1) {
            const childId = uuidOf(200 + root * 10 + child);

            categories.push(
              categoryOf(childId, `Child ${root}.${child}`, "business", rootId)
            );
            lines.push(spendLine(lineId, childId, draw(20_000)));
            lineId += 1;
          }
        }

        const tree = yield* categoryTreeOf(categories);

        const flows = countedFlows(
          yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"))
        );

        const rows = yield* categoryRowsOf(tree, flows);
        const totals = yield* totalsOf(flows, currencyOf("EUR"));

        expect(sumOfRows(rows)).toBe(totals.spendMinor);
        expect(rows.length <= roots).toBe(true);

        for (const root of categories.filter((category) =>
          Option.isNone(category.parentId)
        )) {
          const subtree = descendantsOf(tree, root.id);

          const expected = categories
            .filter((category) => subtree.includes(category.id))
            .flatMap((category) =>
              lines
                .filter((line) => line.categoryId === category.id)
                .reduce((total, line) => total + line.minor, 0)
                .valueOf() === 0
                ? []
                : [
                    lines
                      .filter((line) => line.categoryId === category.id)
                      .reduce((total, line) => total + line.minor, 0),
                  ]
            )
            .reduce((total, value) => total + value, 0);

          const row = rows.find(
            (candidate) =>
              Predicate.isTagged(candidate.category, "Categorised") &&
              candidate.category.categoryId === root.id
          );

          expect(row?.spendMinor).toBe(expected);
        }
      }
    })
);

it.effect(
  "every root category's share of a non-zero spend adds up to one hundred percent",
  () =>
    Effect.gen(function* shares() {
      for (let index = 0; index < CASES; index += 1) {
        const categories = [categoryOf(uuidOf(1), "One", "personal", null)];

        const lines: LineSeed[] = [spendLine(1, uuidOf(1), draw(90_000))];

        const extra = draw(4);

        for (let position = 0; position < extra; position += 1) {
          const id = uuidOf(10 + position);

          categories.push(categoryOf(id, `Extra ${position}`, "mixed", null));
          lines.push(spendLine(position + 2, id, draw(90_000)));
        }

        const tree = yield* categoryTreeOf(categories);

        const flows = countedFlows(
          yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"))
        );

        const rows = yield* categoryRowsOf(tree, flows);
        const spend = yield* totalsOf(flows, currencyOf("EUR"));

        expect(
          rows.reduce((total, row) => total + row.shareBasisPoints, 0)
        ).toBe(spend.spendMinor === 0 ? 0 : 10_000);
      }
    })
);

it.effect("a cycle of parents is refused instead of rolled up forever", () =>
  Effect.gen(function* refuseCycle() {
    const first = uuidOf(1);
    const second = uuidOf(2);

    const failure = yield* categoryTreeOf([
      categoryOf(first, "First", "personal", second),
      categoryOf(second, "Second", "personal", first),
    ]).pipe(Effect.flip);

    expect(failure._tag).toBe("CategoryCycle");
  })
);

it.effect("the category count leaves archived categories out", () =>
  Effect.gen(function* countLive() {
    const live = categoryOf(uuidOf(1), "Live", "personal", null);

    const archived = categoryOf(
      uuidOf(2),
      "Archived",
      "personal",
      null,
      "2024-01-31T10:00:00.000Z"
    );

    const child = categoryOf(uuidOf(3), "Child", "personal", uuidOf(1));
    const tree = yield* categoryTreeOf([live, archived, child]);

    expect(categoryCountOf([live, archived, child])).toBe(2);

    const rolled = rolledSpendOf(
      tree,
      new Map<CategoryId, bigint>([
        [live.id, 100n],
        [child.id, 50n],
      ])
    );

    expect(rolled.get(live.id)).toBe(150n);
  })
);

it.effect(
  "personal, business, mixed and uncategorised spend split the whole spend",
  () =>
    Effect.gen(function* spendSplit() {
      for (let index = 0; index < 40; index += 1) {
        const personal = uuidOf(1);
        const business = uuidOf(2);
        const mixed = uuidOf(3);

        const tree = yield* categoryTreeOf([
          categoryOf(personal, "Personal", "personal", null),
          categoryOf(business, "Business", "business", null),
          categoryOf(mixed, "Mixed", "mixed", null),
        ]);

        const lines: LineSeed[] = [
          spendLine(1, personal, draw(40_000)),
          spendLine(2, business, draw(40_000)),
          spendLine(3, mixed, draw(40_000)),
          {
            direction: "out",
            id: 4,
            minor: draw(10_000),
            valueDate: "2024-03-10",
          },
        ];

        const flows = countedFlows(
          yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"))
        );

        const split = yield* spendSplitOf(tree, flows);
        const totals = yield* totalsOf(flows, currencyOf("EUR"));

        expect(split.map((row) => row.bucket)).toStrictEqual([
          "business",
          "mixed",
          "personal",
          "uncategorised",
        ]);
        expect(sumOfRows(split)).toBe(totals.spendMinor);

        if (totals.spendMinor !== 0) {
          expect(
            split.reduce((total, row) => total + row.shareBasisPoints, 0)
          ).toBe(10_000);
        }
      }
    })
);

it.effect("a category with no spend of its own still carries its child's", () =>
  Effect.gen(function* emptyParent() {
    const parent = categoryOf(uuidOf(1), "Parent", "personal", null);
    const child = categoryOf(uuidOf(2), "Child", "personal", uuidOf(1));
    const tree = yield* categoryTreeOf([parent, child]);

    const flows = countedFlows(
      yield* flowsOf(
        [transactionOf(spendLine(1, child.id, 7500))],
        currencyOf("EUR")
      )
    );

    const rows = yield* categoryRowsOf(tree, flows);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.spendMinor).toBe(minorUnits(7500));
    expect(rows[0]?.shareBasisPoints).toBe(10_000);
  })
);
