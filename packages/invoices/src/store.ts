import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { InvoiceStoreError } from "./invoice-store-error.js";
import type {
  ArchivePlace,
  ArchivePlaceDraft,
  DocumentId,
  InvoiceDocument,
  Payment,
  ProfileId,
  TransactionId,
} from "./model.js";

export class InvoiceStore extends Context.Service<
  InvoiceStore,
  {
    readonly document: (
      profileId: ProfileId,
      documentId: DocumentId
    ) => Effect.Effect<Option.Option<InvoiceDocument>, InvoiceStoreError>;
    readonly documents: (
      profileId: ProfileId
    ) => Effect.Effect<readonly InvoiceDocument[], InvoiceStoreError>;
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
    readonly savePlace: (
      profileId: ProfileId,
      draft: ArchivePlaceDraft
    ) => Effect.Effect<ArchivePlace, InvoiceStoreError>;
  }
>()("@pecunia/invoices/InvoiceStore") {}
