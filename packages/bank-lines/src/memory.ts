import { Effect, Layer, Option, Ref } from "effect";

import type { BankLine, CategoryId, LinePatch, ProfileId } from "./model.js";
import { applyLinePatch } from "./patch.js";
import { BankLineStore } from "./store.js";

export interface MemoryCategory {
  readonly id: CategoryId;
  readonly profileId: ProfileId;
}

export interface MemoryBankLineSeed {
  readonly categories: readonly MemoryCategory[];
  readonly lines: readonly BankLine[];
}

interface MemoryBook {
  readonly categories: readonly MemoryCategory[];
  readonly lines: readonly BankLine[];
}

const replaceLine = (lines: readonly BankLine[], line: BankLine) =>
  lines.map((candidate) =>
    candidate.id === line.id && candidate.profileId === line.profileId
      ? line
      : candidate
  );

export const memoryBankLineStoreLayer = (seed: MemoryBankLineSeed) =>
  Layer.effect(
    BankLineStore,
    Effect.gen(function* makeMemoryBankLineStore() {
      const state = yield* Ref.make<MemoryBook>({
        categories: seed.categories,
        lines: seed.lines,
      });

      const categories = Effect.fn("MemoryBankLineStore.categories")(
        function* categories(profileId: ProfileId) {
          const book = yield* Ref.get(state);

          return book.categories
            .filter((category) => category.profileId === profileId)
            .map((category) => category.id);
        }
      );

      const lines = Effect.fn("MemoryBankLineStore.lines")(function* lines(
        profileId: ProfileId
      ) {
        const book = yield* Ref.get(state);

        return book.lines.filter((line) => line.profileId === profileId);
      });

      const patch = Effect.fn("MemoryBankLineStore.patch")(function* patch(
        profileId: ProfileId,
        lineId: BankLine["id"],
        change: LinePatch
      ) {
        return yield* Ref.modify(state, (book) => {
          const current = book.lines.find(
            (candidate) =>
              candidate.id === lineId && candidate.profileId === profileId
          );

          if (current === undefined) {
            return [Option.none<BankLine>(), book];
          }

          const next = applyLinePatch(current, change);

          return [
            Option.some(next),
            { ...book, lines: replaceLine(book.lines, next) },
          ];
        });
      });

      return { categories, lines, patch } as const;
    })
  );
