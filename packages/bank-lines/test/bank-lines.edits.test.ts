import { expect, it } from "@effect/vitest";
import { CurrentPerson } from "@pecunia/access";
import { Effect, Layer, Option } from "effect";

import { editBankLine, listBankLines } from "../src/capabilities.js";
import {
  demoBankLines,
  demoCategories,
  demoPerson,
  demoProfileId,
} from "../src/demo.js";
import { memoryBankLineStoreLayer } from "../src/memory.js";
import {
  CategoryChangeSchema,
  CategoryFilterSchema,
  NoteChangeSchema,
  ReviewFilterSchema,
} from "../src/model.js";
import type { BankLine, BankLineFilter, CategoryId } from "../src/model.js";
import { BankLineService } from "../src/service.js";

const ROUNDS = 600;

const [target] = demoBankLines;

if (target === undefined) {
  throw new Error("The demo book has no bank line to edit");
}

const tuple = <A>(items: readonly A[]): readonly [A, ...A[]] => {
  const [first, ...rest] = items;

  if (first === undefined) {
    throw new Error("A generated pool needs at least one value");
  }

  return [first, ...rest];
};

const categoryIds = tuple(demoCategories.map((entry) => entry.id));

const noFilter: BankLineFilter = {
  account: Option.none(),
  amount: Option.none(),
  category: CategoryFilterSchema.cases.Any.make({}),
  direction: Option.none(),
  occurred: Option.none(),
  review: ReviewFilterSchema.cases.Any.make({}),
};

const freshLayer = () =>
  Layer.mergeAll(
    BankLineService.layer.pipe(
      Layer.provide(
        memoryBankLineStoreLayer({
          categories: demoCategories,
          lines: demoBankLines,
        })
      )
    ),
    Layer.succeed(CurrentPerson, demoPerson)
  );

const listLine = (lineId: BankLine["id"]) =>
  listBankLines
    .handler({
      cursor: Option.none(),
      filter: noFilter,
      limit: 200,
      profileId: demoProfileId,
      search: "",
    })
    .pipe(
      Effect.map((page) => page.lines.find((line) => line.id === lineId)),
      Effect.orDie
    );

const categoryAt = (round: number) => {
  const found = categoryIds[round % categoryIds.length];

  if (found === undefined) {
    throw new Error("The demo book has no category at that position");
  }

  return found;
};

const editCategory = (categoryId: CategoryId) =>
  editBankLine
    .handler({
      category: CategoryChangeSchema.cases.Assigned.make({ categoryId }),
      lineId: target.id,
      note: NoteChangeSchema.cases.Unchanged.make({}),
      profileId: demoProfileId,
    })
    .pipe(Effect.orDie);

const editNote = (text: string) =>
  editBankLine
    .handler({
      category: CategoryChangeSchema.cases.Unchanged.make({}),
      lineId: target.id,
      note: NoteChangeSchema.cases.Set.make({ text }),
      profileId: demoProfileId,
    })
    .pipe(Effect.orDie);

it.effect(
  "keeps every acknowledged edit when a category edit and a note edit race on one line",
  () =>
    Effect.gen(function* raceEdits() {
      for (let round = 0; round < ROUNDS; round += 1) {
        const categoryId = categoryAt(round);

        const note = `note-round-${round}`;

        const [categorized, noted] = yield* Effect.all(
          [editCategory(categoryId), editNote(note)],
          { concurrency: 2 }
        );

        expect(
          Option.getOrNull(categorized.category),
          `round ${round} acknowledged a category it did not assign`
        ).toBe(categoryId);

        expect(
          noted.note,
          `round ${round} acknowledged a note it did not set`
        ).toBe(note);

        const current = yield* listLine(target.id);

        if (current === undefined) {
          throw new Error(`Round ${round} lost bank line ${target.id}`);
        }

        expect(
          Option.getOrNull(current.category),
          `round ${round} lost an acknowledged category edit`
        ).toBe(categoryId);

        expect(
          current.note,
          `round ${round} lost an acknowledged note edit`
        ).toBe(note);
      }

      const last = yield* listLine(target.id);

      if (last === undefined) {
        throw new Error(`The final listing lost bank line ${target.id}`);
      }

      expect(last.note).toBe(`note-round-${ROUNDS - 1}`);
      expect(Option.getOrNull(last.category)).toBe(categoryAt(ROUNDS - 1));
    }).pipe(Effect.provide(freshLayer()), Effect.orDie)
);

it.effect(
  "keeps the last acknowledged category and note from two loops racing on one line",
  () =>
    Effect.gen(function* raceLoops() {
      const acknowledgedCategories: CategoryId[] = [];
      const acknowledgedNotes: string[] = [];

      const categoryLoop = Effect.gen(function* runCategoryLoop() {
        for (let round = 0; round < ROUNDS; round += 1) {
          const categoryId = categoryAt(round);

          const saved = yield* editCategory(categoryId);

          expect(Option.getOrNull(saved.category)).toBe(categoryId);

          acknowledgedCategories.push(categoryId);
        }
      });

      const noteLoop = Effect.gen(function* runNoteLoop() {
        for (let round = 0; round < ROUNDS; round += 1) {
          const note = `race-note-${round}`;

          const saved = yield* editNote(note);

          expect(saved.note).toBe(note);

          acknowledgedNotes.push(note);
        }
      });

      yield* Effect.all([categoryLoop, noteLoop], { concurrency: 2 });

      const last = yield* listLine(target.id);

      expect(acknowledgedCategories).toHaveLength(ROUNDS);
      expect(acknowledgedNotes).toHaveLength(ROUNDS);

      if (last === undefined) {
        throw new Error(`The final listing lost bank line ${target.id}`);
      }

      expect(Option.getOrNull(last.category)).toBe(
        acknowledgedCategories.at(-1)
      );
      expect(last.note).toBe(acknowledgedNotes.at(-1));
    }).pipe(Effect.provide(freshLayer()), Effect.orDie)
);
