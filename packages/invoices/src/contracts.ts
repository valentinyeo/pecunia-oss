import { Forbidden } from "@pecunia/access";
import { defineContract } from "@pecunia/capability/contract";
import { Schema } from "effect";

import { ArchivePlaceUnavailable } from "./archive-place-unavailable.js";
import { ArchiveStateRefused } from "./archive-state-refused.js";
import { InvoiceAlreadyAttached } from "./invoice-already-attached.js";
import { InvoiceStoreError } from "./invoice-store-error.js";
import {
  ArchivePlaceSchema,
  ArchivePlacesSchema,
  AttachInvoiceRequestSchema,
  InvoiceDocumentSchema,
  MatchInvoicesRequestSchema,
  MatchProposalsSchema,
  ReadArchivePlacesRequestSchema,
  RecordInvoiceArchiveRequestSchema,
  ReserveInvoiceArchiveRequestSchema,
  SaveArchivePlaceRequestSchema,
} from "./model.js";
import { UnknownArchivePlace } from "./unknown-archive-place.js";
import { UnknownInvoice } from "./unknown-invoice.js";
import { UnknownPayment } from "./unknown-payment.js";

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

export const invoiceContracts = [
  attachInvoiceContract,
  matchInvoicesContract,
  readArchivePlacesContract,
  saveArchivePlaceContract,
  reserveInvoiceArchiveContract,
  recordInvoiceArchiveContract,
] as const;
