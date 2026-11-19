import { codecs, parse } from "@pecunia/core/model";
import type {
  ProfileId,
  TaxObligation,
  TaxObligationId,
  TaxProfile,
  TaxProfileId,
  Timestamp,
} from "@pecunia/core/model";
import { Clock, DateTime, Effect, Layer, SynchronizedRef } from "effect";
import * as SecureRandom from "effect/crypto/SecureRandom";

import { declarationKey, ownedBy, sameAmountAndStatus } from "./dues.js";
import type { DueOwner } from "./dues.js";
import type { DueDeclaration, SyncReceipt } from "./model.js";
import { TaxDueStore } from "./store.js";
import type { ReplaceDuesRequest, TaxDueStoreService } from "./store.js";
import { unknownTaxProfile } from "./unknown-tax-profile.js";

export interface TaxDueSeed {
  readonly dues: readonly TaxObligation[];
  readonly taxProfiles: readonly TaxProfile[];
}

const stampedNow: Effect.Effect<Timestamp> = Clock.currentTimeMillis.pipe(
  Effect.map((millis) =>
    parse(codecs.timestamp, DateTime.formatIso(DateTime.makeUnsafe(millis)))
  )
);

const obligationOf = (input: {
  readonly declaration: DueDeclaration;
  readonly id: TaxObligationId;
  readonly profileId: ProfileId;
  readonly syncedAt: Timestamp;
  readonly taxProfileId: TaxProfileId;
}): TaxObligation =>
  parse(codecs.taxObligation, {
    ...input.declaration,
    id: input.id,
    profileId: input.profileId,
    syncedAt: input.syncedAt,
    taxProfileId: input.taxProfileId,
  });

const declaredOnce = (
  declarations: readonly DueDeclaration[]
): readonly DueDeclaration[] => [
  ...new Map(
    declarations.map((declaration) => [
      declarationKey(declaration),
      declaration,
    ])
  ).values(),
];

const reconcile = (
  seed: TaxDueSeed,
  request: ReplaceDuesRequest,
  minted: ReadonlyMap<string, TaxObligationId>,
  at: Timestamp
): readonly [SyncReceipt, TaxDueSeed] => {
  const declarations = declaredOnce(request.declarations);
  const existing = seed.dues.filter((due) => ownedBy(due, request));

  const byKey = new Map(
    existing.map((due) => [declarationKey(due), due] as const)
  );

  let inserted = 0;
  let unchanged = 0;
  let updated = 0;

  const next = declarations.map((declaration) => {
    const key = declarationKey(declaration);
    const found = byKey.get(key);
    const id = found === undefined ? minted.get(key) : found.id;

    if (id === undefined) {
      throw new Error(`The reconciled tax due ${key} has no id.`);
    }

    if (found === undefined) {
      inserted += 1;
    } else if (sameAmountAndStatus(found, declaration)) {
      unchanged += 1;
    } else {
      updated += 1;
    }

    return obligationOf({
      declaration,
      id,
      profileId: request.profileId,
      syncedAt: at,
      taxProfileId: request.taxProfileId,
    });
  });

  const declaredKeys = new Set(declarations.map(declarationKey));

  const removed = existing.filter(
    (due) => !declaredKeys.has(declarationKey(due))
  ).length;

  const kept = seed.dues.filter((due) => !ownedBy(due, request));

  return [
    { inserted, removed, unchanged, updated },
    { dues: [...kept, ...next], taxProfiles: seed.taxProfiles },
  ];
};

export const makeMemoryTaxDueStore = (
  seed: TaxDueSeed
): Effect.Effect<TaxDueStoreService, never, SecureRandom.SecureRandom> =>
  Effect.gen(function* makeStore() {
    const random = yield* SecureRandom.SecureRandom;
    const state = yield* SynchronizedRef.make(seed);

    const mintId = Effect.map(random.uuidV7(), (value) =>
      parse(codecs.taxObligationId, value)
    );

    const dues = Effect.fn("MemoryTaxDueStore.dues")(function* dues(
      profileId: ProfileId
    ) {
      const current = yield* SynchronizedRef.get(state);

      return current.dues.filter((due) => due.profileId === profileId);
    });

    const taxProfiles = Effect.fn("MemoryTaxDueStore.taxProfiles")(
      function* taxProfiles(profileId: ProfileId) {
        const current = yield* SynchronizedRef.get(state);

        return current.taxProfiles.filter(
          (taxProfile) => taxProfile.profileId === profileId
        );
      }
    );

    const replace = Effect.fn("MemoryTaxDueStore.replace")(function* replace(
      request: ReplaceDuesRequest
    ) {
      return yield* SynchronizedRef.modifyEffect(state, (current) =>
        Effect.gen(function* replaceDues() {
          const owned = current.taxProfiles.some(
            (taxProfile) =>
              taxProfile.id === request.taxProfileId &&
              taxProfile.profileId === request.profileId
          );

          if (!owned) {
            return yield* unknownTaxProfile(request);
          }

          const at = yield* stampedNow;

          const existing = new Set(
            current.dues
              .filter((due) => ownedBy(due, request))
              .map(declarationKey)
          );

          const minted = new Map<string, TaxObligationId>();

          for (const declaration of declaredOnce(request.declarations)) {
            const key = declarationKey(declaration);

            if (!existing.has(key)) {
              minted.set(key, yield* mintId);
            }
          }

          return reconcile(current, request, minted, at);
        })
      );
    });

    return { dues, replace, taxProfiles } as const;
  });

export const memoryTaxDueStoreLayer = (seed: TaxDueSeed) =>
  Layer.effect(TaxDueStore, makeMemoryTaxDueStore(seed));

export const seededMemoryTaxDueStoreLayer = (input: {
  readonly declarations: readonly DueDeclaration[];
  readonly owner: DueOwner;
  readonly seed: TaxDueSeed;
}): Layer.Layer<TaxDueStore, never, SecureRandom.SecureRandom> =>
  Layer.effect(
    TaxDueStore,
    Effect.gen(function* seedDemoStore() {
      const store = yield* TaxDueStore;

      yield* store
        .replace({
          declarations: input.declarations,
          profileId: input.owner.profileId,
          taxProfileId: input.owner.taxProfileId,
        })
        .pipe(Effect.orDie);

      return store;
    })
  ).pipe(Layer.provide(memoryTaxDueStoreLayer(input.seed)));
