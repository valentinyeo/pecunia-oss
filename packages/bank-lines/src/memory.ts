import { Effect, Layer, Ref } from "effect";

import type { BankLine, CategoryId, ProfileId } from "./model.js";
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
  lines.some(
    (candidate) =>
      candidate.id === line.id && candidate.profileId === line.profileId
  )
    ? lines.map((candidate) =>
        candidate.id === line.id && candidate.profileId === line.profileId
          ? line
          : candidate
      )
    : [...lines, line];

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

      const save = Effect.fn("MemoryBankLineStore.save")(function* save(
        line: BankLine
      ) {
        yield* Ref.update(state, (book) => ({
          ...book,
          lines: replaceLine(book.lines, line),
        }));

        return line;
      });

      return { categories, lines, save } as const;
    })
  );
