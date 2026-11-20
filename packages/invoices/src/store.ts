import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { InvoiceStoreError } from "./invoice-store-error.js";
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

export class InvoiceStore extends Context.Service<
  InvoiceStore,
  {
    readonly createDocument: (
      profileId: ProfileId,
      file: InvoiceFile
    ) => Effect.Effect<InvoiceDocument, InvoiceStoreError>;
    readonly deleteDocument: (
      profileId: ProfileId,
      documentId: DocumentId
    ) => Effect.Effect<void, InvoiceStoreError>;
    readonly deleteSource: (
      profileId: ProfileId,
      sourceId: InvoiceSourceId
    ) => Effect.Effect<boolean, InvoiceStoreError>;
    readonly document: (
      profileId: ProfileId,
      documentId: DocumentId
    ) => Effect.Effect<Option.Option<InvoiceDocument>, InvoiceStoreError>;
    readonly documents: (
      profileId: ProfileId
    ) => Effect.Effect<readonly InvoiceDocument[], InvoiceStoreError>;
    readonly exceptions: (
      profileId: ProfileId
    ) => Effect.Effect<readonly InvoiceException[], InvoiceStoreError>;
    readonly payment: (
      profileId: ProfileId,
      transactionId: TransactionId
    ) => Effect.Effect<Option.Option<Payment>, InvoiceStoreError>;
    readonly payments: (
      profileId: ProfileId
    ) => Effect.Effect<readonly Payment[], InvoiceStoreError>;
    readonly places: (
      profileId: ProfileId
    ) => Effect.Effect<readonly ArchivePlace[], InvoiceStoreError>;
    readonly saveDocument: (
      profileId: ProfileId,
      document: InvoiceDocument
    ) => Effect.Effect<InvoiceDocument, InvoiceStoreError>;
    readonly saveException: (
      profileId: ProfileId,
      exception: InvoiceException
    ) => Effect.Effect<InvoiceException, InvoiceStoreError>;
    readonly savePlace: (
      profileId: ProfileId,
      draft: ArchivePlaceDraft
    ) => Effect.Effect<ArchivePlace, InvoiceStoreError>;
    readonly saveSource: (
      profileId: ProfileId,
      draft: InvoiceSourceDraft
    ) => Effect.Effect<InvoiceSource, InvoiceStoreError>;
    readonly sources: (
      profileId: ProfileId
    ) => Effect.Effect<readonly InvoiceSource[], InvoiceStoreError>;
  }
>()("@pecunia/invoices/InvoiceStore") {}
