import { CurrentPerson } from "@pecunia/access";
import type {
  AnyContract,
  ContractFailureOf,
  InputOf,
  OutputOf,
} from "@pecunia/capability/contract";
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
import {
  decodeInvoiceRequest,
  decodeRecordInvoiceExceptionRequest,
  decodeRegisterLegacyInvoicesRequest,
} from "./decode-invoice-request.js";
import { readScopeOf, writeScopeOf } from "./scope.js";
import { InvoiceService } from "./service.js";

const decodedHandler =
  <ContractType extends AnyContract>(
    contract: ContractType,
    run: (
      input: InputOf<ContractType>["Type"]
    ) => Effect.Effect<
      OutputOf<ContractType>["Type"],
      ContractFailureOf<ContractType>["Type"],
      CurrentPerson | InvoiceService
    >
  ) =>
  (input: unknown) =>
    Effect.gen(function* decodedCapability() {
      const parsed = yield* decodeInvoiceRequest(
        contract.name,
        contract.input,
        input
      );

      // SAFETY: decodeInvoiceRequest validated input with contract.input.
      return yield* run(parsed as InputOf<ContractType>["Type"]);
    });

export const attachInvoice = implement(
  attachInvoiceContract,
  decodedHandler(
    attachInvoiceContract,
    ({ documentId, profileId, transactionId }) =>
      Effect.gen(function* attachProfileInvoice() {
        const person = yield* CurrentPerson;

        const scope = yield* writeScopeOf(person, profileId);

        const service = yield* InvoiceService;

        return yield* service.attach(scope, { documentId, transactionId });
      })
  )
);

export const matchInvoices = implement(
  matchInvoicesContract,
  decodedHandler(matchInvoicesContract, ({ profileId }) =>
    Effect.gen(function* matchProfileInvoices() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return { proposals: yield* service.match(scope) };
    })
  )
);

export const readArchivePlaces = implement(
  readArchivePlacesContract,
  decodedHandler(readArchivePlacesContract, ({ profileId }) =>
    Effect.gen(function* readProfileArchivePlaces() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return { places: yield* service.places(scope) };
    })
  )
);

export const saveArchivePlace = implement(
  saveArchivePlaceContract,
  decodedHandler(
    saveArchivePlaceContract,
    ({ blocklist, profileId, provider, rootRef }) =>
      Effect.gen(function* saveProfileArchivePlace() {
        const person = yield* CurrentPerson;

        const scope = yield* writeScopeOf(person, profileId);

        const service = yield* InvoiceService;

        return yield* service.savePlace(scope, {
          blocklist,
          provider,
          rootRef,
        });
      })
  )
);

export const reserveInvoiceArchive = implement(
  reserveInvoiceArchiveContract,
  decodedHandler(
    reserveInvoiceArchiveContract,
    ({ documentId, fileId, placeId, profileId }) =>
      Effect.gen(function* reserveProfileInvoiceArchive() {
        const person = yield* CurrentPerson;

        const scope = yield* writeScopeOf(person, profileId);

        const service = yield* InvoiceService;

        return yield* service.reserve(scope, { documentId, fileId, placeId });
      })
  )
);

export const recordInvoiceArchive = implement(
  recordInvoiceArchiveContract,
  decodedHandler(
    recordInvoiceArchiveContract,
    ({ documentId, outcome, profileId }) =>
      Effect.gen(function* recordProfileInvoiceArchive() {
        const person = yield* CurrentPerson;

        const scope = yield* writeScopeOf(person, profileId);

        const service = yield* InvoiceService;

        return yield* service.record(scope, { documentId, outcome });
      })
  )
);

export const listInvoiceStatus = implement(
  listInvoiceStatusContract,
  decodedHandler(listInvoiceStatusContract, ({ month, profileId }) =>
    Effect.gen(function* listProfileInvoiceStatus() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.status(scope, month);
    })
  )
);

export const countInvoiceCoverage = implement(
  countInvoiceCoverageContract,
  decodedHandler(countInvoiceCoverageContract, ({ profileId }) =>
    Effect.gen(function* countProfileInvoiceCoverage() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.coverage(scope);
    })
  )
);

export const recordInvoiceException = implement(
  recordInvoiceExceptionContract,
  (input) =>
    Effect.gen(function* recordProfileInvoiceException() {
      const parsed = yield* decodeRecordInvoiceExceptionRequest(input);

      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, parsed.profileId);

      const service = yield* InvoiceService;

      return yield* service.recordException(scope, {
        reason: parsed.reason,
        transactionId: parsed.transactionId,
      });
    })
);

export const readInvoiceSources = implement(
  readInvoiceSourcesContract,
  decodedHandler(readInvoiceSourcesContract, ({ profileId }) =>
    Effect.gen(function* readProfileInvoiceSources() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return { sources: yield* service.sources(scope) };
    })
  )
);

export const saveInvoiceSource = implement(
  saveInvoiceSourceContract,
  decodedHandler(
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
  )
);

export const deleteInvoiceSource = implement(
  deleteInvoiceSourceContract,
  decodedHandler(deleteInvoiceSourceContract, ({ profileId, sourceId }) =>
    Effect.gen(function* deleteProfileInvoiceSource() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.deleteSource(scope, sourceId);
    })
  )
);

export const saveInvoiceFile = implement(
  saveInvoiceFileContract,
  decodedHandler(
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
  )
);

export const registerLegacyInvoices = implement(
  registerLegacyInvoicesContract,
  (input) =>
    Effect.gen(function* registerProfileLegacyInvoices() {
      const parsed = yield* decodeRegisterLegacyInvoicesRequest(input);

      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, parsed.profileId);

      const service = yield* InvoiceService;

      return yield* service.registerLegacy(scope, parsed.files);
    })
);

export const readInvoiceDocument = implement(
  readInvoiceDocumentContract,
  decodedHandler(readInvoiceDocumentContract, ({ documentId, profileId }) =>
    Effect.gen(function* readProfileInvoiceDocument() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.document(scope, documentId);
    })
  )
);

export const removeInvoiceDocument = implement(
  removeInvoiceDocumentContract,
  decodedHandler(removeInvoiceDocumentContract, ({ documentId, profileId }) =>
    Effect.gen(function* removeProfileInvoiceDocument() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvoiceService;

      return yield* service.removeDocument(scope, documentId);
    })
  )
);

export const listArchivedDocuments = implement(
  listArchivedDocumentsContract,
  decodedHandler(
    listArchivedDocumentsContract,
    ({ cursor, limit, profileId }) =>
      Effect.gen(function* listProfileArchivedDocuments() {
        const person = yield* CurrentPerson;

        const scope = yield* readScopeOf(person, profileId);

        const service = yield* InvoiceService;

        return yield* service.archived(scope, { cursor, limit });
      })
  )
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
