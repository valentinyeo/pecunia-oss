import { Forbidden } from "@pecunia/access";
import { defineContract } from "@pecunia/capability/contract";
import { Schema } from "effect";

import { ArchivePathBlocked } from "./archive-path-blocked.js";
import { ArchivePlaceUnavailable } from "./archive-place-unavailable.js";
import { ArchiveStateRefused } from "./archive-state-refused.js";
import { InvoiceAlreadyAttached } from "./invoice-already-attached.js";
import { InvoiceAlreadyInvoiced } from "./invoice-already-invoiced.js";
import { InvoiceNotPayable } from "./invoice-not-payable.js";
import { InvoiceStoreError } from "./invoice-store-error.js";
import {
  ArchivePlaceSchema,
  ArchivePlacesSchema,
  ArchivedDocumentsSchema,
  AttachInvoiceRequestSchema,
  DeleteInvoiceSourceRequestSchema,
  DeleteInvoiceSourceSchema,
  InvoiceCoverageSchema,
  InvoiceDocumentSchema,
  InvoiceExceptionSchema,
  InvoiceSourceSchema,
  InvoiceSourcesSchema,
  InvoiceStatusSchema,
  LegacyFilesSchema,
  ListArchivedDocumentsRequestSchema,
  MatchInvoicesRequestSchema,
  MatchProposalsSchema,
  ReadArchivePlacesRequestSchema,
  ReadInvoiceCoverageRequestSchema,
  ReadInvoiceDocumentRequestSchema,
  ReadInvoiceSourcesRequestSchema,
  ReadInvoiceStatusRequestSchema,
  RecordInvoiceArchiveRequestSchema,
  RecordInvoiceExceptionRequestSchema,
  RegisterLegacyInvoicesRequestSchema,
  RemoveInvoiceDocumentRequestSchema,
  RemovedInvoiceDocumentSchema,
  ReserveInvoiceArchiveRequestSchema,
  SaveArchivePlaceRequestSchema,
  SaveInvoiceFileRequestSchema,
  SaveInvoiceSourceRequestSchema,
  StoredDocumentSchema,
} from "./model.js";
import { UnknownArchivePlace } from "./unknown-archive-place.js";
import { UnknownInvoiceSource } from "./unknown-invoice-source.js";
import { UnknownInvoice } from "./unknown-invoice.js";
import { UnknownPayment } from "./unknown-payment.js";
import { UnknownVendorPayee } from "./unknown-vendor-payee.js";

export const attachInvoiceContract = defineContract("attachInvoice", {
  annotations: { idempotent: true },
  description:
    "Attach one stored invoice document to one payment in the same profile. Attaching the same document to the same payment twice returns it unchanged. A document already attached to another payment is refused by name, so a wrong link is never overwritten silently. The document's amount is kept exactly as stored, in integer minor units, and is never compared with the payment's amount.",
  failure: Schema.Union([
    Forbidden,
    InvoiceAlreadyAttached,
    InvoiceStoreError,
    UnknownInvoice,
    UnknownPayment,
  ]),
  input: AttachInvoiceRequestSchema,
  output: InvoiceDocumentSchema,
});

export const matchInvoicesContract = defineContract("matchInvoices", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "Propose a payment for each unattached invoice document. A proposal needs the same vendor payee on both sides and a document date within five days of the payment date, inclusive. Each document and each payment appears in at most one proposal, nearest date first. Proposals change nothing; attach one with `attachInvoice`.",
  failure: Schema.Union([Forbidden, InvoiceStoreError]),
  input: MatchInvoicesRequestSchema,
  output: MatchProposalsSchema,
});

export const readArchivePlacesContract = defineContract("readArchivePlaces", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List the profile's archive places. A place is the provider, the root folder reference, and the blocklist the profile chose. The root is user data, never a default compiled into the app.",
  failure: Schema.Union([Forbidden, InvoiceStoreError]),
  input: ReadArchivePlacesRequestSchema,
  output: ArchivePlacesSchema,
});

export const saveArchivePlaceContract = defineContract("saveArchivePlace", {
  annotations: { idempotent: true },
  description:
    "Save the profile's archive place for one provider. One place exists per profile and provider, so saving again replaces its root reference and blocklist and keeps its id. The root reference and every blocklist entry are trimmed and must be non-blank, and a blocklist entry is never repeated.",
  failure: Schema.Union([Forbidden, InvoiceStoreError]),
  input: SaveArchivePlaceRequestSchema,
  output: ArchivePlaceSchema,
});

export const reserveInvoiceArchiveContract = defineContract(
  "reserveInvoiceArchive",
  {
    annotations: { idempotent: true },
    description:
      "Reserve the archive file id for one invoice document in one archive place, moving it from unarchived or failed to reserved. Reserving the same file in the same place twice returns it unchanged; a different file, place, or an already archived document is refused. A place whose provider is none stores no file and is refused.",
    failure: Schema.Union([
      ArchivePathBlocked,
      ArchivePlaceUnavailable,
      ArchiveStateRefused,
      Forbidden,
      InvoiceStoreError,
      UnknownArchivePlace,
      UnknownInvoice,
    ]),
    input: ReserveInvoiceArchiveRequestSchema,
    output: InvoiceDocumentSchema,
  }
);

export const recordInvoiceArchiveContract = defineContract(
  "recordInvoiceArchive",
  {
    annotations: { idempotent: true },
    description:
      "Record the outcome of a reserved archive file. Archived stamps the instant the file landed and keeps the reserved file id and place; recording it again keeps the first instant. Failed keeps only the written reason and clears the file id and place. A document that is not reserved is refused by name.",
    failure: Schema.Union([
      ArchiveStateRefused,
      Forbidden,
      InvoiceStoreError,
      UnknownInvoice,
    ]),
    input: RecordInvoiceArchiveRequestSchema,
    output: InvoiceDocumentSchema,
  }
);

export const listInvoiceStatusContract = defineContract("listInvoiceStatus", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List the profile's outgoing payments with the invoice status of each one, newest first, and count the ones still missing an invoice. A payment is archived when at least one document is archived, invoiced when it holds a document, excepted when a written reason stands in for the document, and missing otherwise. Passing a month narrows the list to that month. Incoming payments never appear. Every amount is an integer of minor units. This is also the JSON invoice status feed other tools read.",
  failure: Schema.Union([Forbidden, InvoiceStoreError]),
  input: ReadInvoiceStatusRequestSchema,
  output: InvoiceStatusSchema,
});

export const countInvoiceCoverageContract = defineContract(
  "countInvoiceCoverage",
  {
    annotations: { idempotent: true, readOnly: true },
    description:
      "Count the profile's outgoing payments month by month: how many have an invoice or an archive, how many carry a written exception, and how many still need an invoice. Months are newest first, and each month's three counts add up to its payment count.",
    failure: Schema.Union([Forbidden, InvoiceStoreError]),
    input: ReadInvoiceCoverageRequestSchema,
    output: InvoiceCoverageSchema,
  }
);

export const recordInvoiceExceptionContract = defineContract(
  "recordInvoiceException",
  {
    annotations: { idempotent: true },
    description:
      "Record a written reason for one outgoing payment that has no invoice, so the missing invoice count stops asking for it. Recording a second reason replaces the first. A payment that already holds an invoice, or one that is not outgoing, is refused by name.",
    failure: Schema.Union([
      Forbidden,
      InvoiceAlreadyInvoiced,
      InvoiceNotPayable,
      InvoiceStoreError,
      UnknownPayment,
    ]),
    input: RecordInvoiceExceptionRequestSchema,
    output: InvoiceExceptionSchema,
  }
);

export const readInvoiceSourcesContract = defineContract("readInvoiceSources", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List where each vendor's invoices come from. A source maps a merchant pattern on the statement to the vendor payee and the retrieval route: portal, email, bookkeeper, and whether two factor stands in the way. The pattern matches a merchant by case-insensitive substring.",
  failure: Schema.Union([Forbidden, InvoiceStoreError]),
  input: ReadInvoiceSourcesRequestSchema,
  output: InvoiceSourcesSchema,
});

export const saveInvoiceSourceContract = defineContract("saveInvoiceSource", {
  annotations: { idempotent: true },
  description:
    "Save where one vendor's invoices come from. One source exists per profile and pattern, matched ignoring case, so saving the same pattern again replaces its vendor, route and links and keeps its id. The pattern is trimmed and must be non-blank. A vendor payee the profile's payments do not carry is refused by name.",
  failure: Schema.Union([Forbidden, InvoiceStoreError, UnknownVendorPayee]),
  input: SaveInvoiceSourceRequestSchema,
  output: InvoiceSourceSchema,
});

export const deleteInvoiceSourceContract = defineContract(
  "deleteInvoiceSource",
  {
    annotations: { destructive: true },
    description:
      "Delete one invoice source from the profile. The pattern, vendor and retrieval route go; the payments and documents that already exist are untouched. An unknown source is refused by name.",
    failure: Schema.Union([Forbidden, InvoiceStoreError, UnknownInvoiceSource]),
    input: DeleteInvoiceSourceRequestSchema,
    output: DeleteInvoiceSourceSchema,
  }
);

export const saveInvoiceFileContract = defineContract("saveInvoiceFile", {
  annotations: { idempotent: true },
  description:
    "Store one invoice file and attach it to one payment in the same profile. The file is registered once per profile under its SHA-256 fingerprint, so storing the same file again returns the stored document instead of a second copy, then attaches it. Attaching a document that is already attached to another payment is refused by name.",
  failure: Schema.Union([
    Forbidden,
    InvoiceAlreadyAttached,
    InvoiceStoreError,
    UnknownPayment,
  ]),
  input: SaveInvoiceFileRequestSchema,
  output: InvoiceDocumentSchema,
});

export const registerLegacyInvoicesContract = defineContract(
  "registerLegacyInvoices",
  {
    annotations: { idempotent: true },
    description:
      "Register invoice files that predate the archive, up to 200 in one call. Each file is fingerprinted by SHA-256 and stored once per profile: a file whose fingerprint is already known comes back marked Existing with the stored document, and a new file comes back marked Stored. Nothing is attached to a payment here; legacy files are linked afterwards with `matchInvoices` and `attachInvoice`.",
    failure: Schema.Union([Forbidden, InvoiceStoreError]),
    input: RegisterLegacyInvoicesRequestSchema,
    output: LegacyFilesSchema,
  }
);

export const readInvoiceDocumentContract = defineContract(
  "readInvoiceDocument",
  {
    annotations: { idempotent: true, readOnly: true },
    description:
      "Read one stored invoice file. The document carries the content type, original filename, storage key, SHA-256, size in bytes, the payment it belongs to and the archive state; the path is where the file sits in the place's folder tree once archived. The bytes themselves live in the object store at the storage key.",
    failure: Schema.Union([Forbidden, InvoiceStoreError, UnknownInvoice]),
    input: ReadInvoiceDocumentRequestSchema,
    output: StoredDocumentSchema,
  }
);

export const removeInvoiceDocumentContract = defineContract(
  "removeInvoiceDocument",
  {
    annotations: { destructive: true },
    description:
      "Remove one stored invoice document from the profile, so its payment needs an invoice again. The record goes; a copy already written into an archive place is left where it is. An unknown document is refused by name.",
    failure: Schema.Union([Forbidden, InvoiceStoreError, UnknownInvoice]),
    input: RemoveInvoiceDocumentRequestSchema,
    output: RemovedInvoiceDocumentSchema,
  }
);

export const listArchivedDocumentsContract = defineContract(
  "listArchivedDocuments",
  {
    annotations: { idempotent: true, readOnly: true },
    description:
      "Page through the profile's archived invoice documents, newest archive instant first, then document id ascending. A cursor carries the instant and id of the last document read, so a walk repeats nothing and drops nothing. Each row carries the path in the place's folder tree. A page holds between 1 and 200 documents.",
    failure: Schema.Union([Forbidden, InvoiceStoreError]),
    input: ListArchivedDocumentsRequestSchema,
    output: ArchivedDocumentsSchema,
  }
);

export const invoiceContracts = [
  attachInvoiceContract,
  matchInvoicesContract,
  readArchivePlacesContract,
  saveArchivePlaceContract,
  reserveInvoiceArchiveContract,
  recordInvoiceArchiveContract,
  listInvoiceStatusContract,
  countInvoiceCoverageContract,
  recordInvoiceExceptionContract,
  readInvoiceSourcesContract,
  saveInvoiceSourceContract,
  deleteInvoiceSourceContract,
  saveInvoiceFileContract,
  registerLegacyInvoicesContract,
  readInvoiceDocumentContract,
  removeInvoiceDocumentContract,
  listArchivedDocumentsContract,
] as const;
