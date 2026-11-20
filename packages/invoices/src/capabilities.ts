import { CurrentPerson } from "@pecunia/access";
import { implement } from "@pecunia/capability/implement";
import { Effect } from "effect";

import {
  attachInvoiceContract,
  matchInvoicesContract,
  readArchivePlacesContract,
  recordInvoiceArchiveContract,
  reserveInvoiceArchiveContract,
  saveArchivePlaceContract,
} from "./contracts.js";
import { readScopeOf, writeScopeOf } from "./scope.js";
import { InvoiceService } from "./service.js";

export const attachInvoice = implement(
  attachInvoiceContract,
  ({ documentId, profileId, transactionId }) =>
    Effect.gen(function* attachProfileInvoice() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.attach(scope, { documentId, transactionId });
    })
);

export const matchInvoices = implement(matchInvoicesContract, ({ profileId }) =>
  Effect.gen(function* matchProfileInvoices() {
    const person = yield* CurrentPerson;

    const scope = yield* readScopeOf(person, profileId);

    const service = yield* InvoiceService;

    return { proposals: yield* service.match(scope) };
  })
);

export const readArchivePlaces = implement(
  readArchivePlacesContract,
  ({ profileId }) =>
    Effect.gen(function* readProfileArchivePlaces() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return { places: yield* service.places(scope) };
    })
);

export const saveArchivePlace = implement(
  saveArchivePlaceContract,
  ({ blocklist, profileId, provider, rootRef }) =>
    Effect.gen(function* saveProfileArchivePlace() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.savePlace(scope, { blocklist, provider, rootRef });
    })
);

export const reserveInvoiceArchive = implement(
  reserveInvoiceArchiveContract,
  ({ documentId, fileId, placeId, profileId }) =>
    Effect.gen(function* reserveProfileInvoiceArchive() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.reserve(scope, { documentId, fileId, placeId });
    })
);

export const recordInvoiceArchive = implement(
  recordInvoiceArchiveContract,
  ({ documentId, outcome, profileId }) =>
    Effect.gen(function* recordProfileInvoiceArchive() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.record(scope, { documentId, outcome });
    })
);

export const invoiceCapabilities = [
  attachInvoice,
  matchInvoices,
  readArchivePlaces,
  saveArchivePlace,
  reserveInvoiceArchive,
  recordInvoiceArchive,
] as const;
