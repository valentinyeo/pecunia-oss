import { Effect, Layer, Option, Ref, Result, Schema } from "effect";

import type { IllegalStatusChange } from "./illegal-status-change.js";
import { SubscriptionSchema } from "./model.js";
import type {
  CategoryId,
  Charge,
  CurrencyCode,
  Payee,
  ProfileId,
  StatusChange,
  Subscription,
  SubscriptionCategoryChange,
  SubscriptionEntry,
  SubscriptionId,
  TimestampMillis,
} from "./model.js";
import { applyCategoryChange, applyCategoryChangeToCharge } from "./patch.js";
import { applyStatusChange, confirmSubscription } from "./status.js";
import { SubscriptionStore } from "./store.js";
import type { RepeatMark } from "./store.js";
import { SubscriptionStoreError } from "./subscription-store-error.js";

export interface MemoryCategory {
  readonly id: CategoryId;
  readonly profileId: ProfileId;
}

export interface MemoryProfile {
  readonly baseCurrency: CurrencyCode;
  readonly id: ProfileId;
}

export interface MemorySubscriptionSeed {
  readonly categories: readonly MemoryCategory[];
  readonly charges: readonly Charge[];
  readonly payees: readonly Payee[];
  readonly profiles: readonly MemoryProfile[];
  readonly subscriptions: readonly Subscription[];
}

interface MemoryBook {
  readonly charges: readonly Charge[];
  readonly nextId: number;
  readonly subscriptions: readonly Subscription[];
}

const subscription = Schema.decodeSync(SubscriptionSchema);

const replaceSubscription = (
  subscriptions: readonly Subscription[],
  next: Subscription
): readonly Subscription[] =>
  subscriptions.map((candidate) =>
    candidate.id === next.id && candidate.profileId === next.profileId
      ? next
      : candidate
  );

const payeeNameOf = (
  payees: readonly Payee[],
  row: Subscription
): Option.Option<string> =>
  Option.map(
    Option.fromNullishOr(
      payees.find(
        (payee) => payee.id === row.payeeId && payee.profileId === row.profileId
      )
    ),
    (payee) => payee.name
  );

const entryOf = (
  payees: readonly Payee[],
  row: Subscription
): Effect.Effect<SubscriptionEntry, SubscriptionStoreError> =>
  Effect.fromOption(
    Option.map(payeeNameOf(payees, row), (payeeName) => ({
      payeeName,
      subscription: row,
    })),
    () =>
      new SubscriptionStoreError({
        message: `Repeat payment ${row.id} names payee ${row.payeeId}, which profile ${row.profileId} does not hold.`,
        repair:
          "Restore the payee row of that profile, or delete the repeat payment, then read the list again.",
      })
  );

export const memorySubscriptionStoreLayer = (seed: MemorySubscriptionSeed) =>
  Layer.effect(
    SubscriptionStore,
    Effect.gen(function* makeMemorySubscriptionStore() {
      const state = yield* Ref.make<MemoryBook>({
        charges: seed.charges,
        nextId: seed.subscriptions.length + 1,
        subscriptions: seed.subscriptions,
      });

      const baseCurrency = Effect.fn("MemorySubscriptionStore.baseCurrency")(
        function* baseCurrency(profileId: ProfileId) {
          const profile = seed.profiles.find(
            (candidate) => candidate.id === profileId
          );

          if (profile === undefined) {
            return yield* new SubscriptionStoreError({
              message: `Profile ${profileId} is not in the store's profiles, so it has no base currency.`,
              repair:
                "Seed the profile with its base currency, then read the repeat payments again.",
            });
          }

          return profile.baseCurrency;
        }
      );

      const categories = (profileId: ProfileId) =>
        Effect.succeed(
          seed.categories
            .filter((category) => category.profileId === profileId)
            .map((category) => category.id)
        );

      const charges = Effect.fn("MemorySubscriptionStore.charges")(
        function* charges(profileId: ProfileId) {
          const book = yield* Ref.get(state);

          return book.charges.filter(
            (charge) => charge.profileId === profileId
          );
        }
      );

      const payees = (profileId: ProfileId) =>
        Effect.succeed(
          seed.payees.filter((payee) => payee.profileId === profileId)
        );

      const entries = Effect.fn("MemorySubscriptionStore.entries")(
        function* entries(profileId: ProfileId) {
          const book = yield* Ref.get(state);
          const collected: SubscriptionEntry[] = [];

          for (const row of book.subscriptions) {
            if (row.profileId === profileId) {
              collected.push(yield* entryOf(seed.payees, row));
            }
          }

          return collected;
        }
      );

      const mark = Effect.fn("MemorySubscriptionStore.mark")(function* mark(
        profileId: ProfileId,
        requested: RepeatMark
      ) {
        const stored = yield* Ref.modify(state, (book) => {
          const current = book.subscriptions.find(
            (row) =>
              row.profileId === profileId && row.payeeId === requested.payeeId
          );

          if (current !== undefined) {
            const confirmed = confirmSubscription(
              current.frequency === requested.frequency
                ? current
                : {
                    ...current,
                    frequency: requested.frequency,
                    nextExpectedOn: requested.nextExpectedOn,
                  },
              requested.status.at
            );

            return [
              confirmed,
              {
                ...book,
                subscriptions: replaceSubscription(
                  book.subscriptions,
                  confirmed
                ),
              },
            ];
          }

          const created = subscription({
            ...requested,
            categoryId: null,
            id: `subscription-${book.nextId}`,
            profileId,
          });

          return [
            created,
            {
              charges: book.charges,
              nextId: book.nextId + 1,
              subscriptions: [...book.subscriptions, created],
            },
          ];
        });

        return yield* entryOf(seed.payees, stored);
      });

      const patchStatus = Effect.fn("MemorySubscriptionStore.patchStatus")(
        function* patchStatus(
          profileId: ProfileId,
          subscriptionId: SubscriptionId,
          change: StatusChange,
          at: TimestampMillis
        ) {
          const outcome = yield* Ref.modify(
            state,
            (
              book
            ): readonly [
              Result.Result<Option.Option<Subscription>, IllegalStatusChange>,
              MemoryBook,
            ] => {
              const current = book.subscriptions.find(
                (row) =>
                  row.profileId === profileId && row.id === subscriptionId
              );

              if (current === undefined) {
                return [Result.succeed(Option.none<Subscription>()), book];
              }

              const changed = applyStatusChange(current, change, at);

              return Result.match(changed, {
                onFailure: (failure) => [Result.fail(failure), book],
                onSuccess: (next) => [
                  Result.succeed(Option.some(next)),
                  {
                    ...book,
                    subscriptions: replaceSubscription(
                      book.subscriptions,
                      next
                    ),
                  },
                ],
              });
            }
          );

          const patched = yield* Effect.fromResult(outcome);

          return yield* Option.match(patched, {
            onNone: () => Effect.succeed(Option.none<SubscriptionEntry>()),
            onSome: (row) => Effect.asSome(entryOf(seed.payees, row)),
          });
        }
      );

      const categorise = Effect.fn("MemorySubscriptionStore.categorise")(
        function* categorise(
          profileId: ProfileId,
          subscriptionId: SubscriptionId,
          change: SubscriptionCategoryChange
        ) {
          const changed = yield* Ref.modify(
            state,
            (book): readonly [Option.Option<Subscription>, MemoryBook] => {
              const current = book.subscriptions.find(
                (row) =>
                  row.profileId === profileId && row.id === subscriptionId
              );

              if (current === undefined) {
                return [Option.none<Subscription>(), book];
              }

              const next = applyCategoryChange(current, change);

              return [
                Option.some(next),
                {
                  charges: book.charges.map((charge) =>
                    charge.profileId === profileId &&
                    charge.payeeId === current.payeeId
                      ? applyCategoryChangeToCharge(charge, change)
                      : charge
                  ),
                  nextId: book.nextId,
                  subscriptions: replaceSubscription(book.subscriptions, next),
                },
              ];
            }
          );

          return yield* Option.match(changed, {
            onNone: () => Effect.succeed(Option.none<SubscriptionEntry>()),
            onSome: (row) => Effect.asSome(entryOf(seed.payees, row)),
          });
        }
      );

      return {
        baseCurrency,
        categorise,
        categories,
        charges,
        entries,
        mark,
        patchStatus,
        payees,
      } as const;
    })
  );
