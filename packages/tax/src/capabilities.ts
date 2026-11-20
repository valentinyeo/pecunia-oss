import { CurrentPerson } from "@pecunia/access";
import { implement } from "@pecunia/capability/implement";
import { Effect } from "effect";

import { listTaxDuesContract, syncTaxDuesContract } from "./contracts.js";
import { readScopeOf, writeScopeOf } from "./scope.js";
import { TaxDueService } from "./service.js";

export const listTaxDues = implement(listTaxDuesContract, ({ profileId }) =>
  Effect.gen(function* listProfileTaxDues() {
    const person = yield* CurrentPerson;
    const scope = yield* readScopeOf(person, profileId);
    const service = yield* TaxDueService;

    return yield* service.list(scope);
  })
);

export const syncTaxDues = implement(
  syncTaxDuesContract,
  ({ profileId, taxProfileId }) =>
    Effect.gen(function* syncProfileTaxDues() {
      const person = yield* CurrentPerson;
      const scope = yield* writeScopeOf(person, profileId);
      const service = yield* TaxDueService;

      return yield* service.sync(scope, { profileId, taxProfileId });
    })
);

export const taxDueCapabilities = [listTaxDues, syncTaxDues] as const;
