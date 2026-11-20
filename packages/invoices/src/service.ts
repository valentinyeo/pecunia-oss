import {
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Result,
  Schema,
} from "effect";

import type { ArchivePlaceUnavailable } from "./archive-place-unavailable.js";
import type { ArchiveStateRefused } from "./archive-state-refused.js";
import { recordArchive, reserveArchive } from "./archive.js";
import { InvoiceAlreadyAttached } from "./invoice-already-attached.js";
import type { InvoiceStoreError } from "./invoice-store-error.js";
import { proposeMatches } from "./matching.js";
import {
  ArchivePlaceDraftSchema,
  RecordInvoiceArchiveSchema,
  ReserveInvoiceArchiveSchema,
  TimestampMillisSchema,
} from "./model.js";
import type {
  ArchivePlace,
  ArchivePlaceDraft,
  AttachInvoice,
  DocumentId,
  InvoiceDocument,
  MatchProposal,
  RecordInvoiceArchive,
  ReserveInvoiceArchive,
  TransactionId,
} from "./model.js";
import type { ReadScope, WriteScope } from "./scope.js";
import { InvoiceStore } from "./store.js";
import { UnknownArchivePlace } from "./unknown-archive-place.js";
import { UnknownInvoice } from "./unknown-invoice.js";
import { UnknownPayment } from "./unknown-payment.js";

const currentInstant = DateTime.now.pipe(
  Effect.map(DateTime.toEpochMillis),
  Effect.flatMap((millis) =>
    Schema.decodeEffect(TimestampMillisSchema)(millis)
  ),
  Effect.orDie
);

const unknownInvoice = (scope: WriteScope, documentId: DocumentId) =>
  new UnknownInvoice({
    documentId,
    message: `Invoice ${documentId} is not in profile ${scope.profileId}.`,
    profileId: scope.profileId,
    repair:
      "Use a document id the profile owns, such as one returned by `matchInvoices`.",
  });

const unknownPayment = (scope: WriteScope, transactionId: TransactionId) =>
  new UnknownPayment({
    message: `Payment ${transactionId} is not in profile ${scope.profileId}.`,
    profileId: scope.profileId,
    repair:
      "Use a transaction id from the profile's bank lines, then attach again.",
    transactionId,
  });

export class InvoiceService extends Context.Service<
  InvoiceService,
  {
    readonly attach: (
      scope: WriteScope,
      request: AttachInvoice
    ) => Effect.Effect<
      InvoiceDocument,
      | InvoiceStoreError
      | InvoiceAlreadyAttached
      | UnknownInvoice
      | UnknownPayment
    >;
    readonly match: (
      scope: ReadScope
    ) => Effect.Effect<readonly MatchProposal[], InvoiceStoreError>;
    readonly places: (
      scope: ReadScope
    ) => Effect.Effect<readonly ArchivePlace[], InvoiceStoreError>;
    readonly record: (
      scope: WriteScope,
      request: RecordInvoiceArchive
    ) => Effect.Effect<
      InvoiceDocument,
      ArchiveStateRefused | InvoiceStoreError | UnknownInvoice
    >;
    readonly reserve: (
      scope: WriteScope,
      request: ReserveInvoiceArchive
    ) => Effect.Effect<
      InvoiceDocument,
      | ArchivePlaceUnavailable
      | ArchiveStateRefused
      | InvoiceStoreError
      | UnknownArchivePlace
      | UnknownInvoice
    >;
    readonly savePlace: (
      scope: WriteScope,
      draft: ArchivePlaceDraft
    ) => Effect.Effect<ArchivePlace, InvoiceStoreError>;
  }
>()("@pecunia/invoices/InvoiceService", {
  make: Effect.gen(function* makeInvoiceService() {
    const store = yield* InvoiceStore;

    const documentIn = Effect.fn("InvoiceService.documentIn")(
      function* documentIn(scope: WriteScope, documentId: DocumentId) {
        const found = yield* store.document(scope.profileId, documentId);

        return yield* Effect.fromOption(found, () =>
          unknownInvoice(scope, documentId)
        );
      }
    );

    const attach = Effect.fn("InvoiceService.attach")(function* attach(
      scope: WriteScope,
      request: AttachInvoice
    ) {
      const invoice = yield* documentIn(scope, request.documentId);

      const payment = yield* store.payment(
        scope.profileId,
        request.transactionId
      );

      if (Option.isNone(payment)) {
        return yield* unknownPayment(scope, request.transactionId);
      }

      if (Option.isSome(invoice.transactionId)) {
        return invoice.transactionId.value === request.transactionId
          ? invoice
          : yield* new InvoiceAlreadyAttached({
              attachedTo: invoice.transactionId.value,
              documentId: invoice.id,
              message: `Invoice ${invoice.id} is already attached to payment ${invoice.transactionId.value}.`,
              profileId: scope.profileId,
              repair:
                "Detach is a separate capability. Attach this invoice to a payment only once.",
              transactionId: request.transactionId,
            });
      }

      return yield* store.saveDocument(scope.profileId, {
        ...invoice,
        transactionId: Option.some(request.transactionId),
      });
    });

    const match = Effect.fn("InvoiceService.match")(function* match(
      scope: ReadScope
    ) {
      const documents = yield* store.documents(scope.profileId);
      const payments = yield* store.payments(scope.profileId);

      return proposeMatches(documents, payments);
    });

    const places = Effect.fn("InvoiceService.places")(function* places(
      scope: ReadScope
    ) {
      return yield* store.places(scope.profileId);
    });

    const savePlace = Effect.fn("InvoiceService.savePlace")(function* savePlace(
      scope: WriteScope,
      draft: ArchivePlaceDraft
    ) {
      const parsed = yield* Schema.decodeEffect(ArchivePlaceDraftSchema)(
        draft
      ).pipe(Effect.orDie);

      return yield* store.savePlace(scope.profileId, parsed);
    });

    const reserve = Effect.fn("InvoiceService.reserve")(function* reserve(
      scope: WriteScope,
      request: ReserveInvoiceArchive
    ) {
      const parsedRequest = yield* Schema.decodeEffect(
        ReserveInvoiceArchiveSchema
      )(request).pipe(Effect.orDie);

      const invoice = yield* documentIn(scope, parsedRequest.documentId);

      const placesOfProfile = yield* store.places(scope.profileId);

      const place = placesOfProfile.find(
        (candidate) => candidate.id === parsedRequest.placeId
      );

      if (place === undefined) {
        return yield* new UnknownArchivePlace({
          message: `Archive place ${parsedRequest.placeId} is not in profile ${scope.profileId}.`,
          placeId: parsedRequest.placeId,
          profileId: scope.profileId,
          repair:
            "Save the archive place first with `saveArchivePlace`, then reserve the file again.",
        });
      }

      const reserved = reserveArchive(invoice, place, parsedRequest.fileId);

      if (Result.isFailure(reserved)) {
        return yield* reserved.failure;
      }

      return yield* store.saveDocument(scope.profileId, reserved.success);
    });

    const record = Effect.fn("InvoiceService.record")(function* record(
      scope: WriteScope,
      request: RecordInvoiceArchive
    ) {
      const parsedRequest = yield* Schema.decodeEffect(
        RecordInvoiceArchiveSchema
      )(request).pipe(Effect.orDie);

      const invoice = yield* documentIn(scope, parsedRequest.documentId);

      const archivedAt = yield* currentInstant;

      const recorded = recordArchive(
        invoice,
        parsedRequest.outcome,
        archivedAt
      );

      if (Result.isFailure(recorded)) {
        return yield* recorded.failure;
      }

      return yield* store.saveDocument(scope.profileId, recorded.success);
    });

    return { attach, match, places, record, reserve, savePlace } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
