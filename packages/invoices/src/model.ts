import { ProfileIdSchema } from "@pecunia/access";
import { Schema } from "effect";

export { ProfileIdSchema };

export type { ProfileId } from "@pecunia/access";

export const DocumentIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("InvoiceDocumentId"));

export type DocumentId = typeof DocumentIdSchema.Type;

export const TransactionIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("InvoiceTransactionId"));

export type TransactionId = typeof TransactionIdSchema.Type;

export const ArchivePlaceIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("ArchivePlaceId"));

export type ArchivePlaceId = typeof ArchivePlaceIdSchema.Type;

export const PayeeIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("InvoicePayeeId"));

export type PayeeId = typeof PayeeIdSchema.Type;

export const CurrencyCodeSchema = Schema.String.check(
  Schema.isPattern(/^[A-Z]{3}$/u)
).pipe(Schema.brand("InvoiceCurrencyCode"));

export type CurrencyCode = typeof CurrencyCodeSchema.Type;

export const MinorUnitsSchema = Schema.Int.check(
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an integer a number holds exactly",
  })
).pipe(Schema.brand("InvoiceMinorUnits"));

export type MinorUnits = typeof MinorUnitsSchema.Type;

export const AmountSchema = Schema.Struct({
  currency: CurrencyCodeSchema,
  minor: MinorUnitsSchema,
}).pipe(Schema.brand("InvoiceAmount"));

export type Amount = typeof AmountSchema.Type;

export const TimestampMillisSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("InvoiceTimestampMillis"));

export type TimestampMillis = typeof TimestampMillisSchema.Type;

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const isLeapYear = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const monthLength = (year: number, month: number): number =>
  month === 2 && isLeapYear(year) ? 29 : (monthLengths[month - 1] ?? 0);

const isCalendarDate = (text: string): boolean => {
  const [year = 0, month = 0, day = 0] = text.split("-").map(Number);

  return (
    month >= 1 && month <= 12 && day >= 1 && day <= monthLength(year, month)
  );
};

export const DateOnlySchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u),
  Schema.makeFilter(isCalendarDate, {
    expected: "a calendar date that exists",
  })
).pipe(Schema.brand("InvoiceDate"));

export type DateOnly = typeof DateOnlySchema.Type;

export const DocumentTypeSchema = Schema.Literals([
  "credit_note",
  "invoice",
  "other",
  "receipt",
  "statement",
]);

export type DocumentType = typeof DocumentTypeSchema.Type;

export const DocumentSourceSchema = Schema.Literals([
  "agent",
  "email",
  "legacy_upload",
  "upload",
]);

export type DocumentSource = typeof DocumentSourceSchema.Type;

export const ArchiveProviderSchema = Schema.Literals([
  "drive",
  "local",
  "none",
]);

export type ArchiveProvider = typeof ArchiveProviderSchema.Type;

export const ArchiveFileIdSchema = Schema.Trim.check(Schema.isMinLength(1));

export type ArchiveFileId = typeof ArchiveFileIdSchema.Type;

export const ArchiveReasonSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(500)
);

export type ArchiveReason = typeof ArchiveReasonSchema.Type;

export const ArchiveStateTagSchema = Schema.Literals([
  "Archived",
  "Failed",
  "Reserved",
  "Unarchived",
]);

export type ArchiveStateTag = typeof ArchiveStateTagSchema.Type;

export const ArchiveStateSchema = Schema.TaggedUnion({
  Archived: {
    archivedAt: TimestampMillisSchema,
    fileId: ArchiveFileIdSchema,
    placeId: ArchivePlaceIdSchema,
  },
  Failed: { reason: ArchiveReasonSchema },
  Reserved: {
    fileId: ArchiveFileIdSchema,
    placeId: ArchivePlaceIdSchema,
  },
  Unarchived: {},
});

export type ArchiveState = typeof ArchiveStateSchema.Type;

export const InvoiceDocumentSchema = Schema.Struct({
  amount: Schema.OptionFromNullishOr(AmountSchema),
  archive: ArchiveStateSchema,
  contentType: Schema.NonEmptyString,
  documentDate: DateOnlySchema,
  documentType: DocumentTypeSchema,
  id: DocumentIdSchema,
  originalFilename: Schema.NonEmptyString,
  profileId: ProfileIdSchema,
  r2Key: Schema.NonEmptyString,
  sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
  sizeBytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  source: DocumentSourceSchema,
  sourceRef: Schema.OptionFromNullishOr(Schema.String),
  transactionId: Schema.OptionFromNullishOr(TransactionIdSchema),
  vendorPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
});

export type InvoiceDocument = typeof InvoiceDocumentSchema.Type;

export const PaymentSchema = Schema.Struct({
  amount: AmountSchema,
  id: TransactionIdSchema,
  paidOn: DateOnlySchema,
  payeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
  profileId: ProfileIdSchema,
});

export type Payment = typeof PaymentSchema.Type;

const blocklistIsDistinct = (entries: readonly string[]): boolean =>
  new Set(entries).size === entries.length;

export const BlocklistSchema = Schema.Array(
  Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(200))
).check(
  Schema.makeFilter(blocklistIsDistinct, {
    expected: "a blocklist with no repeated entry",
  })
);

export type Blocklist = typeof BlocklistSchema.Type;

export const ArchivePlaceSchema = Schema.Struct({
  blocklist: BlocklistSchema,
  id: ArchivePlaceIdSchema,
  profileId: ProfileIdSchema,
  provider: ArchiveProviderSchema,
  rootRef: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
});

export type ArchivePlace = typeof ArchivePlaceSchema.Type;

export const ArchivePlaceDraftSchema = Schema.Struct({
  blocklist: BlocklistSchema,
  provider: ArchiveProviderSchema,
  rootRef: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
});

export type ArchivePlaceDraft = typeof ArchivePlaceDraftSchema.Type;

export const AttachInvoiceSchema = Schema.Struct({
  documentId: DocumentIdSchema,
  transactionId: TransactionIdSchema,
});

export type AttachInvoice = typeof AttachInvoiceSchema.Type;

export const AttachInvoiceRequestSchema = Schema.Struct({
  ...AttachInvoiceSchema.fields,
  profileId: ProfileIdSchema,
});

export type AttachInvoiceRequest = typeof AttachInvoiceRequestSchema.Type;

export const MatchInvoicesRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type MatchInvoicesRequest = typeof MatchInvoicesRequestSchema.Type;

export const MatchProposalSchema = Schema.Struct({
  daysApart: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  documentId: DocumentIdSchema,
  payeeId: PayeeIdSchema,
  transactionId: TransactionIdSchema,
});

export type MatchProposal = typeof MatchProposalSchema.Type;

export const MatchProposalsSchema = Schema.Struct({
  proposals: Schema.Array(MatchProposalSchema),
});

export type MatchProposals = typeof MatchProposalsSchema.Type;

export const ReadArchivePlacesRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type ReadArchivePlacesRequest =
  typeof ReadArchivePlacesRequestSchema.Type;

export const ArchivePlacesSchema = Schema.Struct({
  places: Schema.Array(ArchivePlaceSchema),
});

export type ArchivePlaces = typeof ArchivePlacesSchema.Type;

export const SaveArchivePlaceRequestSchema = Schema.Struct({
  ...ArchivePlaceDraftSchema.fields,
  profileId: ProfileIdSchema,
});

export type SaveArchivePlaceRequest = typeof SaveArchivePlaceRequestSchema.Type;

export const ReserveInvoiceArchiveSchema = Schema.Struct({
  documentId: DocumentIdSchema,
  fileId: ArchiveFileIdSchema,
  placeId: ArchivePlaceIdSchema,
});

export type ReserveInvoiceArchive = typeof ReserveInvoiceArchiveSchema.Type;

export const ReserveInvoiceArchiveRequestSchema = Schema.Struct({
  ...ReserveInvoiceArchiveSchema.fields,
  profileId: ProfileIdSchema,
});

export type ReserveInvoiceArchiveRequest =
  typeof ReserveInvoiceArchiveRequestSchema.Type;

export const ArchiveOutcomeSchema = Schema.TaggedUnion({
  Archived: {},
  Failed: { reason: ArchiveReasonSchema },
});

export type ArchiveOutcome = typeof ArchiveOutcomeSchema.Type;

export const RecordInvoiceArchiveSchema = Schema.Struct({
  documentId: DocumentIdSchema,
  outcome: ArchiveOutcomeSchema,
});

export type RecordInvoiceArchive = typeof RecordInvoiceArchiveSchema.Type;

export const RecordInvoiceArchiveRequestSchema = Schema.Struct({
  ...RecordInvoiceArchiveSchema.fields,
  profileId: ProfileIdSchema,
});

export type RecordInvoiceArchiveRequest =
  typeof RecordInvoiceArchiveRequestSchema.Type;
