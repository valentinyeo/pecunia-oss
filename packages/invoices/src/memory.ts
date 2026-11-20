import { Effect, Layer, Option, Ref, Schema, Semaphore } from "effect";

import { InvoiceStoreError } from "./invoice-store-error.js";
import {
  ArchivePlaceIdSchema,
  ArchiveStateSchema,
  DocumentIdSchema,
  InvoiceSourceIdSchema,
} from "./model.js";
import type {
  ArchivePlace,
  ArchivePlaceDraft,
  DocumentId,
  InvoiceDocument,
  InvoiceException,
  InvoiceFile,
  InvoiceSource,
  InvoiceSourceDraft,
  InvoiceSourceId,
  Payment,
  ProfileId,
  TransactionId,
} from "./model.js";
import { InvoiceStore } from "./store.js";

export interface InvoiceSeed {
  readonly documents: readonly InvoiceDocument[];
  readonly exceptions?: readonly InvoiceException[];
  readonly payments: readonly Payment[];
  readonly places: readonly ArchivePlace[];
  readonly sources?: readonly InvoiceSource[];
}

const failure = (operation: InvoiceStoreError["operation"], message: string) =>
  new InvoiceStoreError({
    message,
    operation,
    repair: "Check the store binding and retry the call.",
  });

const placeIdOf = (
  profileId: ProfileId,
  provider: ArchivePlaceDraft["provider"]
) => Schema.decodeSync(ArchivePlaceIdSchema)(`place-${profileId}-${provider}`);

const documentOf = (
  profileId: ProfileId,
  file: InvoiceFile,
  id: DocumentId
): InvoiceDocument => ({
  amount: file.amount,
  archive: ArchiveStateSchema.cases.Unarchived.make({}),
  contentType: file.contentType,
  documentDate: file.documentDate,
  documentType: file.documentType,
  id,
  originalFilename: file.originalFilename,
  profileId,
  r2Key: file.r2Key,
  sha256: file.sha256,
  sizeBytes: file.sizeBytes,
  source: file.source,
  sourceRef: file.sourceRef,
  transactionId: Option.none(),
  vendorPayeeId: file.vendorPayeeId,
});

const sourceOf = (
  profileId: ProfileId,
  draft: InvoiceSourceDraft,
  id: InvoiceSourceId
): InvoiceSource => ({
  id,
  loginHint: draft.loginHint,
  notes: draft.notes,
  pattern: draft.pattern,
  portalUrl: draft.portalUrl,
  profileId,
  retrieval: draft.retrieval,
  vendorPayeeId: draft.vendorPayeeId,
});

const samePattern = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

const freshDocumentId = (profileId: ProfileId, sequence: number): DocumentId =>
  Schema.decodeSync(DocumentIdSchema)(`document-new-${profileId}-${sequence}`);

const freshSourceId = (
  profileId: ProfileId,
  sequence: number
): InvoiceSourceId =>
  Schema.decodeSync(InvoiceSourceIdSchema)(
    `source-new-${profileId}-${sequence}`
  );

export const memoryInvoiceStoreLayer = (seed: InvoiceSeed) =>
  Layer.effect(
    InvoiceStore,
    Effect.gen(function* makeMemoryInvoiceStore() {
      const state = yield* Ref.make<InvoiceSeed>({
        documents: seed.documents,
        exceptions: seed.exceptions ?? [],
        payments: seed.payments,
        places: seed.places,
        sources: seed.sources ?? [],
      });

      const writes = yield* Semaphore.make(1);

      const counter = yield* Ref.make(0);

      const nextId = Ref.modify(counter, (current) => [
        current + 1,
        current + 1,
      ]);

      const document = Effect.fn("InvoiceStore.document")(function* document(
        profileId: ProfileId,
        documentId: DocumentId
      ) {
        const current = yield* Ref.get(state);

        return Option.fromUndefinedOr(
          current.documents.find(
            (row) => row.profileId === profileId && row.id === documentId
          )
        );
      });

      const documents = Effect.fn("InvoiceStore.documents")(function* documents(
        profileId: ProfileId
      ) {
        const current = yield* Ref.get(state);

        return current.documents.filter((row) => row.profileId === profileId);
      });

      const createDocument = Effect.fn("InvoiceStore.createDocument")(
        function* createDocument(profileId: ProfileId, file: InvoiceFile) {
          const sequence = yield* nextId;

          const created = documentOf(
            profileId,
            file,
            freshDocumentId(profileId, sequence)
          );

          return yield* writes.withPermit(
            Effect.gen(function* keepNewDocument() {
              const current = yield* Ref.get(state);

              const duplicate = current.documents.find(
                (row) =>
                  row.profileId === profileId && row.sha256 === file.sha256
              );

              if (duplicate !== undefined) {
                return yield* failure(
                  "createDocument",
                  `Invoice ${duplicate.id} already holds fingerprint ${file.sha256} in profile ${profileId}.`
                );
              }

              yield* Ref.set(state, {
                ...current,
                documents: [...current.documents, created],
              });

              return created;
            })
          );
        }
      );

      const deleteDocument = Effect.fn("InvoiceStore.deleteDocument")(
        function* deleteDocument(profileId: ProfileId, documentId: DocumentId) {
          return yield* writes.withPermit(
            Effect.gen(function* dropDocument() {
              const current = yield* Ref.get(state);

              yield* Ref.set(state, {
                ...current,
                documents: current.documents.filter(
                  (row) => row.profileId !== profileId || row.id !== documentId
                ),
              });
            })
          );
        }
      );

      const payment = Effect.fn("InvoiceStore.payment")(function* payment(
        profileId: ProfileId,
        transactionId: TransactionId
      ) {
        const current = yield* Ref.get(state);

        return Option.fromUndefinedOr(
          current.payments.find(
            (row) => row.profileId === profileId && row.id === transactionId
          )
        );
      });

      const payments = Effect.fn("InvoiceStore.payments")(function* payments(
        profileId: ProfileId
      ) {
        const current = yield* Ref.get(state);

        return current.payments.filter((row) => row.profileId === profileId);
      });

      const places = Effect.fn("InvoiceStore.places")(function* places(
        profileId: ProfileId
      ) {
        const current = yield* Ref.get(state);

        return current.places.filter((row) => row.profileId === profileId);
      });

      const saveDocument = Effect.fn("InvoiceStore.saveDocument")(
        function* saveDocument(profileId: ProfileId, invoice: InvoiceDocument) {
          if (invoice.profileId !== profileId) {
            return yield* failure(
              "saveDocument",
              `Invoice ${invoice.id} belongs to another profile, not ${profileId}.`
            );
          }

          return yield* writes.withPermit(
            Effect.gen(function* keepDocument() {
              const current = yield* Ref.get(state);

              const existing = current.documents.find(
                (row) => row.profileId === profileId && row.id === invoice.id
              );

              yield* Ref.set(state, {
                ...current,
                documents:
                  existing === undefined
                    ? [...current.documents, invoice]
                    : current.documents.map((row) =>
                        row === existing ? invoice : row
                      ),
              });

              return invoice;
            })
          );
        }
      );

      const savePlace = Effect.fn("InvoiceStore.savePlace")(function* savePlace(
        profileId: ProfileId,
        draft: ArchivePlaceDraft
      ) {
        return yield* writes.withPermit(
          Effect.gen(function* keepPlace() {
            const current = yield* Ref.get(state);

            const existing = current.places.find(
              (row) =>
                row.profileId === profileId && row.provider === draft.provider
            );

            const place: ArchivePlace = {
              blocklist: draft.blocklist,
              id: existing?.id ?? placeIdOf(profileId, draft.provider),
              profileId,
              provider: draft.provider,
              rootRef: draft.rootRef,
            };

            yield* Ref.set(state, {
              ...current,
              places:
                existing === undefined
                  ? [...current.places, place]
                  : current.places.map((row) =>
                      row === existing ? place : row
                    ),
            });

            return place;
          })
        );
      });

      const exceptions = Effect.fn("InvoiceStore.exceptions")(
        function* exceptions(profileId: ProfileId) {
          const current = yield* Ref.get(state);

          return (current.exceptions ?? []).filter(
            (row) => row.profileId === profileId
          );
        }
      );

      const saveException = Effect.fn("InvoiceStore.saveException")(
        function* saveException(
          profileId: ProfileId,
          exception: InvoiceException
        ) {
          if (exception.profileId !== profileId) {
            return yield* failure(
              "saveException",
              `Exception for ${exception.transactionId} belongs to another profile, not ${profileId}.`
            );
          }

          return yield* writes.withPermit(
            Effect.gen(function* keepException() {
              const current = yield* Ref.get(state);

              const rows = current.exceptions ?? [];

              const existing = rows.find(
                (row) =>
                  row.profileId === profileId &&
                  row.transactionId === exception.transactionId
              );

              yield* Ref.set(state, {
                ...current,
                exceptions:
                  existing === undefined
                    ? [...rows, exception]
                    : rows.map((row) => (row === existing ? exception : row)),
              });

              return exception;
            })
          );
        }
      );

      const sources = Effect.fn("InvoiceStore.sources")(function* sources(
        profileId: ProfileId
      ) {
        const current = yield* Ref.get(state);

        return (current.sources ?? []).filter(
          (row) => row.profileId === profileId
        );
      });

      const saveSource = Effect.fn("InvoiceStore.saveSource")(
        function* saveSource(profileId: ProfileId, draft: InvoiceSourceDraft) {
          const sequence = yield* nextId;

          const fresh = freshSourceId(profileId, sequence);

          return yield* writes.withPermit(
            Effect.gen(function* keepSource() {
              const current = yield* Ref.get(state);

              const rows = current.sources ?? [];

              const existing = rows.find(
                (row) =>
                  row.profileId === profileId &&
                  samePattern(row.pattern, draft.pattern)
              );

              const source = sourceOf(profileId, draft, existing?.id ?? fresh);

              yield* Ref.set(state, {
                ...current,
                sources:
                  existing === undefined
                    ? [...rows, source]
                    : rows.map((row) => (row === existing ? source : row)),
              });

              return source;
            })
          );
        }
      );

      const deleteSource = Effect.fn("InvoiceStore.deleteSource")(
        function* deleteSource(
          profileId: ProfileId,
          sourceId: InvoiceSourceId
        ) {
          return yield* writes.withPermit(
            Effect.gen(function* dropSource() {
              const current = yield* Ref.get(state);

              const rows = current.sources ?? [];

              const found = rows.some(
                (row) => row.profileId === profileId && row.id === sourceId
              );

              yield* Ref.set(state, {
                ...current,
                sources: rows.filter(
                  (row) => row.profileId !== profileId || row.id !== sourceId
                ),
              });

              return found;
            })
          );
        }
      );

      return {
        createDocument,
        deleteDocument,
        deleteSource,
        document,
        documents,
        exceptions,
        payment,
        payments,
        places,
        saveDocument,
        saveException,
        savePlace,
        saveSource,
        sources,
      };
    })
  );
