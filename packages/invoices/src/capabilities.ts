import { CurrentPerson } from "@pecunia/access";
import { implement } from "@pecunia/capability/implement";
import { Effect } from "effect";

import {
  attachInvoiceContract,
  countInvoiceCoverageContract,
  deleteInvoiceSourceContract,
  listArchivedDocumentsContract,
  listInvoiceStatusContract,
  matchInvoicesContract,
  readArchivePlacesContract,
  readInvoiceDocumentContract,
  readInvoiceSourcesContract,
  recordInvoiceArchiveContract,
  recordInvoiceExceptionContract,
  registerLegacyInvoicesContract,
  removeInvoiceDocumentContract,
  reserveInvoiceArchiveContract,
  saveArchivePlaceContract,
  saveInvoiceFileContract,
  saveInvoiceSourceContract,
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

export const listInvoiceStatus = implement(
  listInvoiceStatusContract,
  ({ month, profileId }) =>
    Effect.gen(function* listProfileInvoiceStatus() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.status(scope, month);
    })
);

export const countInvoiceCoverage = implement(
  countInvoiceCoverageContract,
  ({ profileId }) =>
    Effect.gen(function* countProfileInvoiceCoverage() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.coverage(scope);
    })
);

export const recordInvoiceException = implement(
  recordInvoiceExceptionContract,
  ({ profileId, reason, transactionId }) =>
    Effect.gen(function* recordProfileInvoiceException() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.recordException(scope, { reason, transactionId });
    })
);

export const readInvoiceSources = implement(
  readInvoiceSourcesContract,
  ({ profileId }) =>
    Effect.gen(function* readProfileInvoiceSources() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return { sources: yield* service.sources(scope) };
    })
);

export const saveInvoiceSource = implement(
  saveInvoiceSourceContract,
  ({
    loginHint,
    notes,
    pattern,
    portalUrl,
    profileId,
    retrieval,
    vendorPayeeId,
  }) =>
    Effect.gen(function* saveProfileInvoiceSource() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.saveSource(scope, {
        loginHint,
        notes,
        pattern,
        portalUrl,
        retrieval,
        vendorPayeeId,
      });
    })
);

export const deleteInvoiceSource = implement(
  deleteInvoiceSourceContract,
  ({ profileId, sourceId }) =>
    Effect.gen(function* deleteProfileInvoiceSource() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.deleteSource(scope, sourceId);
    })
);

export const saveInvoiceFile = implement(
  saveInvoiceFileContract,
  ({
    amount,
    contentType,
    documentDate,
    documentType,
    originalFilename,
    profileId,
    r2Key,
    sha256,
    sizeBytes,
    source,
    sourceRef,
    transactionId,
    vendorPayeeId,
  }) =>
    Effect.gen(function* saveProfileInvoiceFile() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.saveFile(scope, {
        amount,
        contentType,
        documentDate,
        documentType,
        originalFilename,
        r2Key,
        sha256,
        sizeBytes,
        source,
        sourceRef,
        transactionId,
        vendorPayeeId,
      });
    })
);

export const registerLegacyInvoices = implement(
  registerLegacyInvoicesContract,
  ({ files, profileId }) =>
    Effect.gen(function* registerProfileLegacyInvoices() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.registerLegacy(scope, files);
    })
);

export const readInvoiceDocument = implement(
  readInvoiceDocumentContract,
  ({ documentId, profileId }) =>
    Effect.gen(function* readProfileInvoiceDocument() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.document(scope, documentId);
    })
);

export const removeInvoiceDocument = implement(
  removeInvoiceDocumentContract,
  ({ documentId, profileId }) =>
    Effect.gen(function* removeProfileInvoiceDocument() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.removeDocument(scope, documentId);
    })
);

export const listArchivedDocuments = implement(
  listArchivedDocumentsContract,
  ({ cursor, limit, profileId }) =>
    Effect.gen(function* listProfileArchivedDocuments() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.archived(scope, { cursor, limit });
    })
);

export const invoiceCapabilities = [
  attachInvoice,
  matchInvoices,
  readArchivePlaces,
  saveArchivePlace,
  reserveInvoiceArchive,
  recordInvoiceArchive,
  listInvoiceStatus,
  countInvoiceCoverage,
  recordInvoiceException,
  readInvoiceSources,
  saveInvoiceSource,
  deleteInvoiceSource,
  saveInvoiceFile,
  registerLegacyInvoices,
  readInvoiceDocument,
  removeInvoiceDocument,
  listArchivedDocuments,
] as const;
