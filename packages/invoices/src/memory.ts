import { Effect, Layer, Option, Ref, Schema, Semaphore } from "effect";

import { InvoiceStoreError } from "./invoice-store-error.js";
import { ArchivePlaceIdSchema } from "./model.js";
import type {
  ArchivePlace,
  ArchivePlaceDraft,
  DocumentId,
  InvoiceDocument,
  Payment,
  ProfileId,
  TransactionId,
} from "./model.js";
import { InvoiceStore } from "./store.js";

export interface InvoiceSeed {
  readonly documents: readonly InvoiceDocument[];
  readonly payments: readonly Payment[];
  readonly places: readonly ArchivePlace[];
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

export const memoryInvoiceStoreLayer = (seed: InvoiceSeed) =>
  Layer.effect(
    InvoiceStore,
    Effect.gen(function* makeMemoryInvoiceStore() {
      const state = yield* Ref.make<InvoiceSeed>({
        documents: seed.documents,
        payments: seed.payments,
        places: seed.places,
      });

      const writes = yield* Semaphore.make(1);

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

      return {
        document,
        documents,
        payment,
        payments,
        places,
        saveDocument,
        savePlace,
      };
    })
  );
