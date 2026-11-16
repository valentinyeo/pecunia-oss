import { Effect, Ref } from "effect";

import type { Cursor, RawProviderLine } from "./model.js";
import { ProviderUnavailable } from "./provider-unavailable.js";
import type { BankProviderService } from "./provider.js";

export interface FakeBankPage {
  readonly requestCursor: Cursor | null;
  readonly nextCursor: Cursor | null;
  readonly failuresBeforeSuccess: number;
  readonly lines: readonly RawProviderLine[];
}

export interface FakeBank {
  readonly fetchedCursors: Effect.Effect<readonly (Cursor | null)[]>;
  readonly provider: BankProviderService;
}

const decrement = (
  current: ReadonlyMap<Cursor | null, number>,
  key: Cursor | null
): readonly [number, ReadonlyMap<Cursor | null, number>] => {
  const count = current.get(key) ?? 0;
  const next: readonly [Cursor | null, number] = [key, Math.max(0, count - 1)];

  return [count, new Map([...current.entries(), next])];
};

export const makeFakeBank = (
  script: readonly FakeBankPage[]
): Effect.Effect<FakeBank> =>
  Effect.gen(function* fakeBank() {
    const remaining = yield* Ref.make<ReadonlyMap<Cursor | null, number>>(
      new Map(
        script.map((page) => [page.requestCursor, page.failuresBeforeSuccess])
      )
    );

    const fetched = yield* Ref.make<readonly (Cursor | null)[]>([]);

    const provider: BankProviderService = {
      fetchPage: (request) =>
        Effect.gen(function* servePage() {
          yield* Ref.update(fetched, (all) => [...all, request.cursor]);

          const page = script.find(
            (candidate) => candidate.requestCursor === request.cursor
          );

          if (page === undefined) {
            return yield* new ProviderUnavailable({
              reason: "FakeBank has no scripted page for this cursor",
            });
          }

          const pending = yield* Ref.modify(remaining, (current) =>
            decrement(current, page.requestCursor)
          );

          if (pending > 0) {
            return yield* new ProviderUnavailable({
              reason: "FakeBank scripted fetch failure",
            });
          }

          return { lines: page.lines, nextCursor: page.nextCursor };
        }),
    };

    return { fetchedCursors: Ref.get(fetched), provider };
  });
