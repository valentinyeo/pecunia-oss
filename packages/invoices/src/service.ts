import {
  Context,
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Result,
  Schema,
} from "effect";

import type { ArchivePathBlocked } from "./archive-path-blocked.js";
import { archivePathOf } from "./archive-path.js";
import type { ArchivePlaceUnavailable } from "./archive-place-unavailable.js";
import type { ArchiveStateRefused } from "./archive-state-refused.js";
import { recordArchive, reserveArchive } from "./archive.js";
import { InvoiceAlreadyAttached } from "./invoice-already-attached.js";
import { InvoiceAlreadyInvoiced } from "./invoice-already-invoiced.js";
import { InvoiceExceptionRefused } from "./invoice-exception-refused.js";
import { InvoiceNotPayable } from "./invoice-not-payable.js";
import type { InvoiceStoreError } from "./invoice-store-error.js";
import { LegacyFilesRefused } from "./legacy-files-refused.js";
import { proposeMatches } from "./matching.js";
import {
  ArchivePlaceDraftSchema,
  EXCEPTION_REASON_MAX,
  InvoiceSourceDraftSchema,
  LEGACY_FILES_MAX,
  LegacyOutcomeSchema,
  MonthSchema,
  RecordInvoiceArchiveSchema,
  RecordInvoiceExceptionSchema,
  RegisterLegacyInvoicesSchema,
  ReserveInvoiceArchiveSchema,
  SaveInvoiceFileSchema,
  TimestampMillisSchema,
} from "./model.js";
import type {
  ArchivePlace,
  ArchivePlaceDraft,
  ArchivedDocuments,
  AttachInvoice,
  DocumentId,
  InvoiceCoverage,
  InvoiceDocument,
  InvoiceException,
  InvoiceFile,
  InvoiceSource,
  InvoiceSourceDraft,
  InvoiceSourceId,
  InvoiceStatus,
  LegacyFile,
  LegacyFiles,
  ListArchivedDocuments,
  MatchProposal,
  Month,
  PayeeId,
  ProfileId,
  RecordInvoiceArchive,
  RecordInvoiceException,
  RemovedInvoiceDocument,
  ReserveInvoiceArchive,
  SaveInvoiceFile,
  StoredDocument,
  TransactionId,
} from "./model.js";
import { archivedPageOf } from "./paging.js";
import type { ReadScope, WriteScope } from "./scope.js";
import {
  coverageOf,
  missingCountOf,
  rowsInMonth,
  statusRowsOf,
} from "./status.js";
import type { InvoiceBook } from "./status.js";
import { InvoiceStore } from "./store.js";
import { UnknownArchivePlace } from "./unknown-archive-place.js";
import { UnknownInvoiceSource } from "./unknown-invoice-source.js";
import { UnknownInvoice } from "./unknown-invoice.js";
import { UnknownPayment } from "./unknown-payment.js";
import { UnknownVendorPayee } from "./unknown-vendor-payee.js";

const currentInstant = DateTime.now.pipe(
  Effect.map(DateTime.toEpochMillis),
  Effect.flatMap((millis) =>
    Schema.decodeEffect(TimestampMillisSchema)(millis)
  ),
  Effect.orDie
);

const unknownInvoice = (
  scope: ReadScope | WriteScope,
  documentId: DocumentId
) =>
  new UnknownInvoice({
    documentId,
    message: `Invoice ${documentId} is not in profile ${scope.profileId}.`,
    profileId: scope.profileId,
    repair:
      "Use a document id the profile owns, such as one returned by `matchInvoices`.",
  });

const unknownPayment = (
  scope: ReadScope | WriteScope,
  transactionId: TransactionId
) =>
  new UnknownPayment({
    message: `Payment ${transactionId} is not in profile ${scope.profileId}.`,
    profileId: scope.profileId,
    repair:
      "Use a transaction id from the profile's bank lines, then attach again.",
    transactionId,
  });

const unknownSource = (scope: WriteScope, sourceId: InvoiceSourceId) =>
  new UnknownInvoiceSource({
    message: `Invoice source ${sourceId} is not in profile ${scope.profileId}.`,
    profileId: scope.profileId,
    repair:
      "List the profile's invoice sources with `readInvoiceSources`, then delete one of them.",
    sourceId,
  });

const exceptionRefusalOf = (
  scope: WriteScope,
  request: RecordInvoiceException
): InvoiceExceptionRefused => {
  const reasonLength = request.reason.trim().length;

  if (reasonLength === 0) {
    return new InvoiceExceptionRefused({
      message:
        "The invoice reason is empty, so the payment still looks missing an invoice.",
      profileId: scope.profileId,
      reasonLength,
      repair:
        "Write why the payment has no invoice, up to 500 characters, then record the reason again.",
      transactionId: request.transactionId,
    });
  }

  if (reasonLength > EXCEPTION_REASON_MAX) {
    return new InvoiceExceptionRefused({
      message: `The invoice reason is ${reasonLength} characters long and the limit is ${EXCEPTION_REASON_MAX}.`,
      profileId: scope.profileId,
      reasonLength,
      repair: `Shorten the reason to ${EXCEPTION_REASON_MAX} characters or fewer, then record the reason again.`,
      transactionId: request.transactionId,
    });
  }

  return new InvoiceExceptionRefused({
    message:
      "The exception request names a payment id the invoice book cannot store.",
    profileId: scope.profileId,
    reasonLength,
    repair:
      "Use a payment id from a `listInvoiceStatus` row, then record the reason again.",
    transactionId: request.transactionId,
  });
};

const legacyRefusalOf = (
  scope: WriteScope,
  count: number
): LegacyFilesRefused => {
  if (count > LEGACY_FILES_MAX) {
    return new LegacyFilesRefused({
      count,
      message: `The legacy batch carries ${count} files and the limit is ${LEGACY_FILES_MAX}.`,
      profileId: scope.profileId,
      repair: `Send them in batches of ${LEGACY_FILES_MAX} or fewer files.`,
    });
  }

  if (count === 0) {
    return new LegacyFilesRefused({
      count,
      message:
        "The legacy batch carries no files, so there is nothing to register.",
      profileId: scope.profileId,
      repair: `Send at least one file, up to ${LEGACY_FILES_MAX} in a batch.`,
    });
  }

  return new LegacyFilesRefused({
    count,
    message:
      "A file in the legacy batch is missing a field the invoice book stores.",
    profileId: scope.profileId,
    repair:
      "Send every file with the fields `registerLegacyInvoices` asks for, then try again.",
  });
};

const payeeIdsOf = (
  payments: readonly { readonly payeeId: Option.Option<PayeeId> }[]
): ReadonlySet<string> =>
  new Set(payments.flatMap((payment) => Option.toArray(payment.payeeId)));

const pathOf = (
  document: InvoiceDocument,
  places: readonly ArchivePlace[]
): Option.Option<string> => {
  const { archive, profileId } = document;

  if (!Predicate.isTagged(archive, "Archived")) {
    return Option.none();
  }

  const place = places.find(
    (candidate) =>
      candidate.profileId === profileId && candidate.id === archive.placeId
  );

  return Option.map(Option.fromUndefinedOr(place), (found) =>
    archivePathOf(found, document)
  );
};

export class InvoiceService extends Context.Service<
  InvoiceService,
  {
    readonly archived: (
      scope: ReadScope,
      request: ListArchivedDocuments
    ) => Effect.Effect<ArchivedDocuments, InvoiceStoreError>;
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
    readonly coverage: (
      scope: ReadScope
    ) => Effect.Effect<InvoiceCoverage, InvoiceStoreError>;
    readonly deleteSource: (
      scope: WriteScope,
      sourceId: InvoiceSourceId
    ) => Effect.Effect<
      { readonly sourceId: InvoiceSourceId },
      InvoiceStoreError | UnknownInvoiceSource
    >;
    readonly document: (
      scope: ReadScope,
      documentId: DocumentId
    ) => Effect.Effect<StoredDocument, InvoiceStoreError | UnknownInvoice>;
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
    readonly recordException: (
      scope: WriteScope,
      request: RecordInvoiceException
    ) => Effect.Effect<
      InvoiceException,
      | InvoiceAlreadyInvoiced
      | InvoiceExceptionRefused
      | InvoiceNotPayable
      | InvoiceStoreError
      | UnknownPayment
    >;
    readonly registerLegacy: (
      scope: WriteScope,
      files: readonly InvoiceFile[]
    ) => Effect.Effect<LegacyFiles, InvoiceStoreError | LegacyFilesRefused>;
    readonly removeDocument: (
      scope: WriteScope,
      documentId: DocumentId
    ) => Effect.Effect<
      RemovedInvoiceDocument,
      InvoiceStoreError | UnknownInvoice
    >;
    readonly reserve: (
      scope: WriteScope,
      request: ReserveInvoiceArchive
    ) => Effect.Effect<
      InvoiceDocument,
      | ArchivePathBlocked
      | ArchivePlaceUnavailable
      | ArchiveStateRefused
      | InvoiceStoreError
      | UnknownArchivePlace
      | UnknownInvoice
    >;
    readonly saveFile: (
      scope: WriteScope,
      request: SaveInvoiceFile
    ) => Effect.Effect<
      InvoiceDocument,
      InvoiceAlreadyAttached | InvoiceStoreError | UnknownPayment
    >;
    readonly savePlace: (
      scope: WriteScope,
      draft: ArchivePlaceDraft
    ) => Effect.Effect<ArchivePlace, InvoiceStoreError>;
    readonly saveSource: (
      scope: WriteScope,
      draft: InvoiceSourceDraft
    ) => Effect.Effect<InvoiceSource, InvoiceStoreError | UnknownVendorPayee>;
    readonly sources: (
      scope: ReadScope
    ) => Effect.Effect<readonly InvoiceSource[], InvoiceStoreError>;
    readonly status: (
      scope: ReadScope,
      month: Option.Option<Month>
    ) => Effect.Effect<InvoiceStatus, InvoiceStoreError>;
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

    const bookOf = Effect.fn("InvoiceService.bookOf")(function* bookOf(
      profileId: ProfileId
    ) {
      const documents = yield* store.documents(profileId);
      const exceptions = yield* store.exceptions(profileId);
      const payments = yield* store.payments(profileId);
      const sources = yield* store.sources(profileId);

      const book: InvoiceBook = { documents, exceptions, payments, sources };

      return book;
    });

    const attachTo = Effect.fn("InvoiceService.attachTo")(function* attachTo(
      scope: WriteScope,
      invoice: InvoiceDocument,
      transactionId: TransactionId
    ) {
      if (Option.isSome(invoice.transactionId)) {
        return invoice.transactionId.value === transactionId
          ? invoice
          : yield* new InvoiceAlreadyAttached({
              attachedTo: invoice.transactionId.value,
              documentId: invoice.id,
              message: `Invoice ${invoice.id} is already attached to payment ${invoice.transactionId.value}.`,
              profileId: scope.profileId,
              repair:
                "Detach is a separate capability. Attach this invoice to a payment only once.",
              transactionId,
            });
      }

      return yield* store.saveDocument(scope.profileId, {
        ...invoice,
        transactionId: Option.some(transactionId),
      });
    });

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

      return yield* attachTo(scope, invoice, request.transactionId);
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

    const status = Effect.fn("InvoiceService.status")(function* status(
      scope: ReadScope,
      month: Option.Option<Month>
    ) {
      const parsedMonth = Option.isNone(month)
        ? Option.none<Month>()
        : Option.some(
            yield* Schema.decodeEffect(MonthSchema)(month.value).pipe(
              Effect.orDie
            )
          );

      const book = yield* bookOf(scope.profileId);

      const rows = statusRowsOf(book);

      const chosen = Option.match(parsedMonth, {
        onNone: () => rows,
        onSome: (value) => rowsInMonth(rows, value),
      });

      return {
        missingCount: missingCountOf(chosen),
        month: parsedMonth,
        rows: chosen,
      };
    });

    const coverage = Effect.fn("InvoiceService.coverage")(function* coverage(
      scope: ReadScope
    ) {
      const book = yield* bookOf(scope.profileId);

      return { months: coverageOf(statusRowsOf(book)) };
    });

    const recordException = Effect.fn("InvoiceService.recordException")(
      function* recordException(
        scope: WriteScope,
        request: RecordInvoiceException
      ) {
        const parsedRequest = yield* Schema.decodeEffect(
          RecordInvoiceExceptionSchema
        )(request).pipe(
          Effect.mapError(() => exceptionRefusalOf(scope, request))
        );

        const payment = yield* store.payment(
          scope.profileId,
          parsedRequest.transactionId
        );

        if (Option.isNone(payment)) {
          return yield* unknownPayment(scope, parsedRequest.transactionId);
        }

        if (payment.value.direction !== "out") {
          return yield* new InvoiceNotPayable({
            direction: payment.value.direction,
            message: `Payment ${parsedRequest.transactionId} is ${payment.value.direction}, so it needs no invoice.`,
            profileId: scope.profileId,
            repair:
              "Record a reason only for an outgoing payment, such as one `listInvoiceStatus` returns.",
            transactionId: parsedRequest.transactionId,
          });
        }

        const documents = yield* store.documents(scope.profileId);

        const invoiced = documents.find(
          (document) =>
            Option.getOrUndefined(document.transactionId) ===
            parsedRequest.transactionId
        );

        if (invoiced !== undefined) {
          return yield* new InvoiceAlreadyInvoiced({
            documentId: invoiced.id,
            message: `Payment ${parsedRequest.transactionId} already holds invoice ${invoiced.id}, so it needs no written reason.`,
            profileId: scope.profileId,
            repair:
              "Remove the invoice with `removeInvoiceDocument` if it is wrong, then record the reason.",
            transactionId: parsedRequest.transactionId,
          });
        }

        const recordedAt = yield* currentInstant;

        return yield* store.saveException(scope.profileId, {
          profileId: scope.profileId,
          reason: parsedRequest.reason,
          recordedAt,
          transactionId: parsedRequest.transactionId,
        });
      }
    );

    const sources = Effect.fn("InvoiceService.sources")(function* sources(
      scope: ReadScope
    ) {
      return yield* store.sources(scope.profileId);
    });

    const saveSource = Effect.fn("InvoiceService.saveSource")(
      function* saveSource(scope: WriteScope, draft: InvoiceSourceDraft) {
        const parsed = yield* Schema.encodeEffect(InvoiceSourceDraftSchema)(
          draft
        ).pipe(
          Effect.flatMap(Schema.decodeEffect(InvoiceSourceDraftSchema)),
          Effect.orDie
        );

        if (Option.isSome(parsed.vendorPayeeId)) {
          const payments = yield* store.payments(scope.profileId);

          if (!payeeIdsOf(payments).has(parsed.vendorPayeeId.value)) {
            return yield* new UnknownVendorPayee({
              message: `Vendor payee ${parsed.vendorPayeeId.value} has no payment in profile ${scope.profileId}.`,
              payeeId: parsed.vendorPayeeId.value,
              profileId: scope.profileId,
              repair:
                "Use a payee the profile's bank lines carry, then save the invoice source again.",
            });
          }
        }

        return yield* store.saveSource(scope.profileId, parsed);
      }
    );

    const deleteSource = Effect.fn("InvoiceService.deleteSource")(
      function* deleteSource(scope: WriteScope, sourceId: InvoiceSourceId) {
        const removed = yield* store.deleteSource(scope.profileId, sourceId);

        if (!removed) {
          return yield* unknownSource(scope, sourceId);
        }

        return { sourceId };
      }
    );

    const document = Effect.fn("InvoiceService.document")(function* document(
      scope: ReadScope,
      documentId: DocumentId
    ) {
      const found = yield* store.document(scope.profileId, documentId);

      const invoice = yield* Effect.fromOption(found, () =>
        unknownInvoice(scope, documentId)
      );

      const placesOfProfile = yield* store.places(scope.profileId);

      return { document: invoice, path: pathOf(invoice, placesOfProfile) };
    });

    const archived = Effect.fn("InvoiceService.archived")(function* archived(
      scope: ReadScope,
      request: ListArchivedDocuments
    ) {
      const documents = yield* store.documents(scope.profileId);
      const placesOfProfile = yield* store.places(scope.profileId);

      return archivedPageOf({
        cursor: request.cursor,
        documents,
        limit: request.limit,
        places: placesOfProfile,
      });
    });

    const removeDocument = Effect.fn("InvoiceService.removeDocument")(
      function* removeDocument(scope: WriteScope, documentId: DocumentId) {
        yield* documentIn(scope, documentId);

        yield* store.deleteDocument(scope.profileId, documentId);

        return { documentId };
      }
    );

    const registerLegacy = Effect.fn("InvoiceService.registerLegacy")(
      function* registerLegacy(
        scope: WriteScope,
        files: readonly InvoiceFile[]
      ) {
        const parsed = yield* Schema.encodeEffect(RegisterLegacyInvoicesSchema)(
          { files }
        ).pipe(
          Effect.flatMap(Schema.decodeEffect(RegisterLegacyInvoicesSchema)),
          Effect.mapError(() => legacyRefusalOf(scope, files.length))
        );

        const known = [...(yield* store.documents(scope.profileId))];

        const registered: LegacyFile[] = [];

        for (const file of parsed.files) {
          const existing = known.find(
            (candidate) => candidate.sha256 === file.sha256
          );

          if (existing !== undefined) {
            registered.push({
              document: existing,
              outcome: LegacyOutcomeSchema.cases.Existing.make({}),
            });

            continue;
          }

          const created = yield* store.createDocument(scope.profileId, file);

          known.push(created);

          registered.push({
            document: created,
            outcome: LegacyOutcomeSchema.cases.Stored.make({}),
          });
        }

        return { files: registered };
      }
    );

    const saveFile = Effect.fn("InvoiceService.saveFile")(function* saveFile(
      scope: WriteScope,
      request: SaveInvoiceFile
    ) {
      const parsed = yield* Schema.encodeEffect(SaveInvoiceFileSchema)(
        request
      ).pipe(
        Effect.flatMap(Schema.decodeEffect(SaveInvoiceFileSchema)),
        Effect.orDie
      );

      const payment = yield* store.payment(
        scope.profileId,
        parsed.transactionId
      );

      if (Option.isNone(payment)) {
        return yield* unknownPayment(scope, parsed.transactionId);
      }

      const known = yield* store.documents(scope.profileId);

      const existing = known.find(
        (candidate) => candidate.sha256 === parsed.sha256
      );

      const invoice =
        existing ??
        (yield* store.createDocument(scope.profileId, {
          amount: parsed.amount,
          contentType: parsed.contentType,
          documentDate: parsed.documentDate,
          documentType: parsed.documentType,
          originalFilename: parsed.originalFilename,
          r2Key: parsed.r2Key,
          sha256: parsed.sha256,
          sizeBytes: parsed.sizeBytes,
          source: parsed.source,
          sourceRef: parsed.sourceRef,
          vendorPayeeId: parsed.vendorPayeeId,
        }));

      return yield* attachTo(scope, invoice, parsed.transactionId);
    });

    return {
      archived,
      attach,
      coverage,
      deleteSource,
      document,
      match,
      places,
      record,
      recordException,
      registerLegacy,
      removeDocument,
      reserve,
      saveFile,
      savePlace,
      saveSource,
      sources,
      status,
    } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
