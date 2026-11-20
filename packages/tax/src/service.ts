import { Context, Effect, Layer } from "effect";

import { orderDues } from "./dues.js";
import type { SyncReceipt, SyncTaxDuesRequest, TaxDues } from "./model.js";
import type { ReadScope, WriteScope } from "./scope.js";
import { TaxDueStore } from "./store.js";
import { runSyncTaxDues } from "./sync-machine.js";
import type { SyncFailure } from "./sync-machine.js";
import { TaxBooks } from "./tax-books.js";
import type { TaxDueStoreError } from "./tax-due-store-error.js";
import { unknownTaxProfile } from "./unknown-tax-profile.js";

export class TaxDueService extends Context.Service<
  TaxDueService,
  {
    readonly list: (
      scope: ReadScope
    ) => Effect.Effect<TaxDues, TaxDueStoreError>;
    readonly sync: (
      scope: WriteScope,
      request: SyncTaxDuesRequest
    ) => Effect.Effect<SyncReceipt, SyncFailure>;
  }
>()("@pecunia/tax/TaxDueService", {
  make: Effect.gen(function* makeTaxDueService() {
    const store = yield* TaxDueStore;
    const books = yield* TaxBooks;

    const list = Effect.fn("TaxDueService.list")(function* list(
      scope: ReadScope
    ) {
      const dues = yield* store.dues(scope.profileId);
      const taxProfiles = yield* store.taxProfiles(scope.profileId);

      return { dues: orderDues(dues), taxProfiles };
    });

    const sync = Effect.fn("TaxDueService.sync")(function* sync(
      scope: WriteScope,
      request: SyncTaxDuesRequest
    ) {
      const taxProfiles = yield* store.taxProfiles(scope.profileId);

      if (
        !taxProfiles.some(
          (taxProfile) => taxProfile.id === request.taxProfileId
        )
      ) {
        return yield* unknownTaxProfile({
          profileId: scope.profileId,
          taxProfileId: request.taxProfileId,
        });
      }

      return yield* runSyncTaxDues({
        profileId: scope.profileId,
        taxProfileId: request.taxProfileId,
      }).pipe(
        Effect.provideService(TaxBooks, books),
        Effect.provideService(TaxDueStore, store)
      );
    });

    return { list, sync } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
