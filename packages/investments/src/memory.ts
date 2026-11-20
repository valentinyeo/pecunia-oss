import { Effect, Layer, Option, Ref } from "effect";

import { DuplicateHolding } from "./duplicate-holding.js";
import { MismatchedProfile } from "./mismatched-profile.js";
import type {
  Holding,
  HoldingId,
  HoldingPatch,
  InvestmentPlatform,
  ProfileId,
} from "./model.js";
import { applyHoldingPatch } from "./patch.js";
import { InvestmentStore } from "./store.js";
import type { UpsertOutcome } from "./store.js";

export interface InvestmentMemorySeed {
  readonly holdings: readonly Holding[];
  readonly platforms: readonly InvestmentPlatform[];
}

const sameHolding = (
  left: Holding,
  right: {
    readonly profileId: ProfileId;
    readonly symbol: string;
    readonly platformId: string;
  }
) =>
  left.profileId === right.profileId &&
  left.platformId === right.platformId &&
  left.symbol === right.symbol;

const replace = (holdings: readonly Holding[], next: Holding) =>
  holdings.map((holding) => (holding.id === next.id ? next : holding));

const mismatchedProfile = (profileId: ProfileId, holding: Holding) =>
  new MismatchedProfile({
    holdingProfileId: holding.profileId,
    message: `Holding ${holding.symbol} names profile ${holding.profileId} and was written to profile ${profileId}.`,
    profileId,
    repair:
      "Stamp the holding with the profile it is written to before calling the store, or write it to the profile it names.",
  });

const namesProfile = (profileId: ProfileId, holding: Holding) =>
  holding.profileId === profileId;

export const memoryInvestmentStoreLayer = (seed: InvestmentMemorySeed) =>
  Layer.effect(
    InvestmentStore,
    Effect.gen(function* makeMemoryInvestmentStore() {
      const state = yield* Ref.make<readonly Holding[]>(seed.holdings);

      const holdings = Effect.fn("MemoryInvestmentStore.holdings")(
        function* holdings(profileId: ProfileId) {
          const book = yield* Ref.get(state);

          return book.filter((holding) => holding.profileId === profileId);
        }
      );

      const platforms = Effect.fn("MemoryInvestmentStore.platforms")(() =>
        Effect.succeed(seed.platforms)
      );

      const insert = Effect.fn("MemoryInvestmentStore.insert")(function* insert(
        profileId: ProfileId,
        holding: Holding
      ) {
        if (!namesProfile(profileId, holding)) {
          return yield* mismatchedProfile(profileId, holding);
        }

        const book = yield* Ref.get(state);

        if (book.some((candidate) => sameHolding(candidate, holding))) {
          return yield* new DuplicateHolding({
            message: `Profile ${profileId} already holds ${holding.symbol} on platform ${holding.platformId}.`,
            platformId: holding.platformId,
            profileId,
            repair:
              "Edit the holding that exists, or pick a symbol the platform does not hold yet.",
            symbol: holding.symbol,
          });
        }

        yield* Ref.update(state, (current) => [...current, holding]);

        return holding;
      });

      const update = Effect.fn("MemoryInvestmentStore.update")(function* update(
        profileId: ProfileId,
        holdingId: HoldingId,
        patch: HoldingPatch
      ) {
        return yield* Ref.modify(state, (book) => {
          const current = book.find(
            (holding) =>
              holding.id === holdingId && holding.profileId === profileId
          );

          if (current === undefined) {
            return [Option.none<Holding>(), book];
          }

          const next = applyHoldingPatch(current, patch);

          return [Option.some(next), replace(book, next)];
        });
      });

      const remove = Effect.fn("MemoryInvestmentStore.remove")(function* remove(
        profileId: ProfileId,
        holdingId: HoldingId
      ) {
        return yield* Ref.modify(state, (book) => {
          const current = book.find(
            (holding) =>
              holding.id === holdingId && holding.profileId === profileId
          );

          return current === undefined
            ? [Option.none<Holding>(), book]
            : [
                Option.some(current),
                book.filter((holding) => holding.id !== holdingId),
              ];
        });
      });

      const upsert = Effect.fn("MemoryInvestmentStore.upsert")(function* upsert(
        profileId: ProfileId,
        holding: Holding
      ) {
        if (!namesProfile(profileId, holding)) {
          return yield* mismatchedProfile(profileId, holding);
        }

        return yield* Ref.modify(
          state,
          (book): readonly [UpsertOutcome, readonly Holding[]] => {
            const current = book.find((candidate) =>
              sameHolding(candidate, holding)
            );

            if (current === undefined) {
              return ["created", [...book, holding]];
            }

            const next = {
              ...holding,
              id: current.id,
              openedOn: current.openedOn,
            };

            return ["updated", replace(book, next)];
          }
        );
      });

      return {
        holdings,
        insert,
        platforms,
        remove,
        update,
        upsert,
      } as const;
    })
  );
