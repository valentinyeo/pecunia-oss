import { Schema } from "effect";

import type { Exact } from "./codec.js";
import {
  ArchiveTargetIdSchema,
  DateOnlySchema,
  DocumentIdSchema,
  InvoiceSourceIdSchema,
  MoneySchema,
  PayeeIdSchema,
  ProfileIdSchema,
  TimestampSchema,
  TransactionIdSchema,
} from "./primitives.js";

export const DocumentTypeSchema = Schema.Literals([
  "credit_note",
  "invoice",
  "other",
  "receipt",
  "statement",
]);

export type DocumentType = Exact<typeof DocumentTypeSchema.Type>;

export const DocumentSourceSchema = Schema.Literals([
  "agent",
  "email",
  "legacy_upload",
  "upload",
]);

export type DocumentSource = Exact<typeof DocumentSourceSchema.Type>;

export const ArchiveStateSchema = Schema.Union([
  Schema.TaggedStruct("Archived", {
    archivedAt: TimestampSchema,
    fileId: Schema.NonEmptyString,
    targetId: ArchiveTargetIdSchema,
  }),
  Schema.TaggedStruct("Failed", { reason: Schema.NonEmptyString }),
  Schema.TaggedStruct("Reserved", {
    fileId: Schema.NonEmptyString,
    targetId: ArchiveTargetIdSchema,
  }),
  Schema.TaggedStruct("Unarchived", {}),
]).pipe(Schema.toTaggedUnion("_tag"));

export type ArchiveState = Exact<typeof ArchiveStateSchema.Type>;

export const InvoiceDocumentSchema = Schema.Struct({
  amount: Schema.OptionFromNullishOr(MoneySchema),
  archive: ArchiveStateSchema,
  contentType: Schema.NonEmptyString,
  documentDate: DateOnlySchema,
  documentType: DocumentTypeSchema,
  id: DocumentIdSchema,
  originalFilename: Schema.NonEmptyString,
  profileId: ProfileIdSchema,
  r2Key: Schema.NonEmptyString,
  sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
  sizeBytes: Schema.Int,
  source: DocumentSourceSchema,
  sourceRef: Schema.OptionFromNullishOr(Schema.String),
  transactionId: Schema.OptionFromNullishOr(TransactionIdSchema),
  vendorPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
});

export type InvoiceDocument = Exact<typeof InvoiceDocumentSchema.Type>;

export const InvoiceSourceSchema = Schema.Struct({
  id: InvoiceSourceIdSchema,
  loginHint: Schema.OptionFromNullishOr(Schema.String),
  pattern: Schema.NonEmptyString,
  portalUrl: Schema.OptionFromNullishOr(Schema.String),
  profileId: ProfileIdSchema,
  retrieval: Schema.Struct({
    bookkeeper: Schema.Boolean,
    email: Schema.Boolean,
    portal: Schema.Boolean,
    twoFactor: Schema.Boolean,
  }),
  vendorPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
});

export type InvoiceSource = Exact<typeof InvoiceSourceSchema.Type>;

export const ArchiveTargetSchema = Schema.Struct({
  blocklist: Schema.Array(Schema.NonEmptyString),
  id: ArchiveTargetIdSchema,
  profileId: ProfileIdSchema,
  provider: Schema.Literals(["drive", "local", "none"]),
  rootRef: Schema.NonEmptyString,
});

export type ArchiveTarget = Exact<typeof ArchiveTargetSchema.Type>;

export const InvoiceExceptionSchema = Schema.Struct({
  profileId: ProfileIdSchema,
  reason: Schema.NonEmptyString.check(Schema.isMinLength(1)),
  recordedAt: TimestampSchema,
  transactionId: TransactionIdSchema,
});

export type InvoiceException = Exact<typeof InvoiceExceptionSchema.Type>;
