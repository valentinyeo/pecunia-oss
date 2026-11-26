import { describe, expect, it } from "@effect/vitest";
import { CurrentPerson } from "@pecunia/access";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { Effect, Layer, Option, Predicate, Schema } from "effect";

import {
  editBankLine,
  listBankLines,
  reviewBankLine,
} from "../src/capabilities.js";
import { d1BankLineStoreLayer } from "../src/d1.js";
import { demoPerson, demoProfileId } from "../src/demo.js";
import {
  BankLineIdSchema,
  CategoryChangeSchema,
  CategoryFilterSchema,
  CategoryIdSchema,
  NoteChangeSchema,
  ReviewFilterSchema,
  SearchTextSchema,
} from "../src/model.js";
import { BankLineService } from "../src/service.js";

const demoD1Layer = () =>
  Layer.mergeAll(
    BankLineService.layer.pipe(
      Layer.provide(d1BankLineStoreLayer),
      Layer.provide(openDemoSqliteLayer())
    ),
    Layer.succeed(CurrentPerson, demoPerson)
  );

describe("d1BankLineStoreLayer against migrated demo D1 schema", () => {
  it.effect(
    "lists all 12 demo lines, edits note and category, and persists review state",
    () =>
      Effect.gen(function* testBankLinesRoundTrip() {
        const emptySearch = yield* Schema.decodeEffect(SearchTextSchema)("");

        const initial = yield* listBankLines.handler({
          cursor: Option.none(),
          filter: {
            account: Option.none(),
            amount: Option.none(),
            category: CategoryFilterSchema.cases.Any.make({}),
            direction: Option.none(),
            occurred: Option.none(),
            review: ReviewFilterSchema.cases.Any.make({}),
          },
          limit: 50,
          profileId: demoProfileId,
          search: emptySearch,
        });

        expect(initial.lines).toHaveLength(12);

        const coffeeLineId = yield* Schema.decodeEffect(BankLineIdSchema)(
          "0192f0c1-0031-7ab6-8c3b-c3bb339364f8"
        );

        const mealsCategoryId = yield* Schema.decodeEffect(CategoryIdSchema)(
          "0192f0c1-0011-79f9-8c9a-c9af5a7eff0d"
        );

        const reviewed = yield* reviewBankLine.handler({
          lineId: coffeeLineId,
          profileId: demoProfileId,
        });

        expect(Predicate.isTagged(reviewed.review, "Reviewed")).toBe(true);

        const edited = yield* editBankLine.handler({
          category: CategoryChangeSchema.cases.Assigned.make({
            categoryId: mealsCategoryId,
          }),
          lineId: coffeeLineId,
          note: NoteChangeSchema.cases.Set.make({ text: "Saved in D1" }),
          profileId: demoProfileId,
        });

        expect(edited.note).toBe("Saved in D1");

        const search =
          yield* Schema.decodeEffect(SearchTextSchema)("Team breakfast");

        const reread = yield* listBankLines.handler({
          cursor: Option.none(),
          filter: {
            account: Option.none(),
            amount: Option.none(),
            category: CategoryFilterSchema.cases.Any.make({}),
            direction: Option.none(),
            occurred: Option.none(),
            review: ReviewFilterSchema.cases.Reviewed.make({}),
          },
          limit: 10,
          profileId: demoProfileId,
          search,
        });

        expect(reread.lines).toHaveLength(1);
        expect(reread.lines[0]?.note).toBe("Saved in D1");
        expect(
          reread.lines[0] !== undefined &&
            Predicate.isTagged(reread.lines[0].review, "Reviewed")
        ).toBe(true);
      }).pipe(Effect.provide(demoD1Layer()))
  );

  it.effect(
    "clears category without violating D1 categorization CHECK constraints",
    () =>
      Effect.gen(function* testClearCategory() {
        const lineId = yield* Schema.decodeEffect(BankLineIdSchema)(
          "0192f0c1-0028-7018-8357-3578945c907b"
        );

        const cleared = yield* editBankLine.handler({
          category: CategoryChangeSchema.cases.Cleared.make({}),
          lineId,
          note: NoteChangeSchema.cases.Unchanged.make({}),
          profileId: demoProfileId,
        });

        expect(Option.isNone(cleared.category)).toBe(true);
      }).pipe(Effect.provide(demoD1Layer()))
  );
});
