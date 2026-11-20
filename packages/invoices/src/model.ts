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

export const MonthSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-(?<month>0[1-9]|1[0-2])$/u)
).pipe(Schema.brand("InvoiceMonth"));

export type Month = typeof MonthSchema.Type;

export const DirectionSchema = Schema.Literals(["in", "neutral", "out"]);

export type Direction = typeof DirectionSchema.Type;

export const MerchantSchema = Schema.Trim.check(Schema.isMaxLength(200));

export type Merchant = typeof MerchantSchema.Type;

export const ExceptionReasonSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(500)
);

export type ExceptionReason = typeof ExceptionReasonSchema.Type;

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

export const ContentTypeSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200)
);

export type ContentType = typeof ContentTypeSchema.Type;

export const FilenameSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(512)
);

export type Filename = typeof FilenameSchema.Type;

export const StorageKeySchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(1024)
);

export type StorageKey = typeof StorageKeySchema.Type;

export const Sha256Schema = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{64}$/u)
);

export type Sha256 = typeof Sha256Schema.Type;

export const SizeBytesSchema = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
);

export type SizeBytes = typeof SizeBytesSchema.Type;

export const CountSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export type Count = typeof CountSchema.Type;

export const InvoiceDocumentSchema = Schema.Struct({
  amount: Schema.OptionFromNullishOr(AmountSchema),
  archive: ArchiveStateSchema,
  contentType: ContentTypeSchema,
  documentDate: DateOnlySchema,
  documentType: DocumentTypeSchema,
  id: DocumentIdSchema,
  originalFilename: FilenameSchema,
  profileId: ProfileIdSchema,
  r2Key: StorageKeySchema,
  sha256: Sha256Schema,
  sizeBytes: SizeBytesSchema,
  source: DocumentSourceSchema,
  sourceRef: Schema.OptionFromNullishOr(Schema.String),
  transactionId: Schema.OptionFromNullishOr(TransactionIdSchema),
  vendorPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
});

export type InvoiceDocument = typeof InvoiceDocumentSchema.Type;

export const PaymentSchema = Schema.Struct({
  amount: AmountSchema,
  direction: DirectionSchema,
  id: TransactionIdSchema,
  merchant: MerchantSchema,
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

export const InvoiceExceptionSchema = Schema.Struct({
  profileId: ProfileIdSchema,
  reason: ExceptionReasonSchema,
  recordedAt: TimestampMillisSchema,
  transactionId: TransactionIdSchema,
});

export type InvoiceException = typeof InvoiceExceptionSchema.Type;

export const RecordInvoiceExceptionSchema = Schema.Struct({
  reason: ExceptionReasonSchema,
  transactionId: TransactionIdSchema,
});

export type RecordInvoiceException = typeof RecordInvoiceExceptionSchema.Type;

export const RecordInvoiceExceptionRequestSchema = Schema.Struct({
  ...RecordInvoiceExceptionSchema.fields,
  profileId: ProfileIdSchema,
});

export type RecordInvoiceExceptionRequest =
  typeof RecordInvoiceExceptionRequestSchema.Type;

export const InvoiceSourceIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("InvoiceSourceId"));

export type InvoiceSourceId = typeof InvoiceSourceIdSchema.Type;

export const SourcePatternSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200)
);

export type SourcePattern = typeof SourcePatternSchema.Type;

export const PortalUrlSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(1024)
);

export type PortalUrl = typeof PortalUrlSchema.Type;

export const LoginHintSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200)
);

export type LoginHint = typeof LoginHintSchema.Type;

export const SourceNotesSchema = Schema.Trim.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(500)
);

export type SourceNotes = typeof SourceNotesSchema.Type;

export const RetrievalSchema = Schema.Struct({
  bookkeeper: Schema.Boolean,
  email: Schema.Boolean,
  portal: Schema.Boolean,
  twoFactor: Schema.Boolean,
});

export type Retrieval = typeof RetrievalSchema.Type;

export const InvoiceSourceSchema = Schema.Struct({
  id: InvoiceSourceIdSchema,
  loginHint: Schema.OptionFromNullishOr(LoginHintSchema),
  notes: Schema.OptionFromNullishOr(SourceNotesSchema),
  pattern: SourcePatternSchema,
  portalUrl: Schema.OptionFromNullishOr(PortalUrlSchema),
  profileId: ProfileIdSchema,
  retrieval: RetrievalSchema,
  vendorPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
});

export type InvoiceSource = typeof InvoiceSourceSchema.Type;

export const InvoiceSourceDraftSchema = Schema.Struct({
  loginHint: Schema.OptionFromNullishOr(LoginHintSchema),
  notes: Schema.OptionFromNullishOr(SourceNotesSchema),
  pattern: SourcePatternSchema,
  portalUrl: Schema.OptionFromNullishOr(PortalUrlSchema),
  retrieval: RetrievalSchema,
  vendorPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
});

export type InvoiceSourceDraft = typeof InvoiceSourceDraftSchema.Type;

export const ReadInvoiceSourcesRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type ReadInvoiceSourcesRequest =
  typeof ReadInvoiceSourcesRequestSchema.Type;

export const InvoiceSourcesSchema = Schema.Struct({
  sources: Schema.Array(InvoiceSourceSchema),
});

export type InvoiceSources = typeof InvoiceSourcesSchema.Type;

export const SaveInvoiceSourceRequestSchema = Schema.Struct({
  ...InvoiceSourceDraftSchema.fields,
  profileId: ProfileIdSchema,
});

export type SaveInvoiceSourceRequest =
  typeof SaveInvoiceSourceRequestSchema.Type;

export const DeleteInvoiceSourceRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
  sourceId: InvoiceSourceIdSchema,
});

export type DeleteInvoiceSourceRequest =
  typeof DeleteInvoiceSourceRequestSchema.Type;

export const DeleteInvoiceSourceSchema = Schema.Struct({
  sourceId: InvoiceSourceIdSchema,
});

export type DeleteInvoiceSource = typeof DeleteInvoiceSourceSchema.Type;

export const PaymentInvoiceStatusSchema = Schema.TaggedUnion({
  Archived: { documents: Schema.NonEmptyArray(DocumentIdSchema) },
  Excepted: { reason: ExceptionReasonSchema },
  Invoiced: { documents: Schema.NonEmptyArray(DocumentIdSchema) },
  Missing: {},
});

export type PaymentInvoiceStatus = typeof PaymentInvoiceStatusSchema.Type;

export const InvoiceStatusRowSchema = Schema.Struct({
  amount: AmountSchema,
  merchant: MerchantSchema,
  paidOn: DateOnlySchema,
  payeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
  sourceId: Schema.OptionFromNullishOr(InvoiceSourceIdSchema),
  status: PaymentInvoiceStatusSchema,
  transactionId: TransactionIdSchema,
});

export type InvoiceStatusRow = typeof InvoiceStatusRowSchema.Type;

export const ReadInvoiceStatusSchema = Schema.Struct({
  month: Schema.OptionFromNullishOr(MonthSchema),
});

export type ReadInvoiceStatus = typeof ReadInvoiceStatusSchema.Type;

export const ReadInvoiceStatusRequestSchema = Schema.Struct({
  ...ReadInvoiceStatusSchema.fields,
  profileId: ProfileIdSchema,
});

export type ReadInvoiceStatusRequest =
  typeof ReadInvoiceStatusRequestSchema.Type;

export const InvoiceStatusSchema = Schema.Struct({
  missingCount: CountSchema,
  month: Schema.OptionFromNullishOr(MonthSchema),
  rows: Schema.Array(InvoiceStatusRowSchema),
});

export type InvoiceStatus = typeof InvoiceStatusSchema.Type;

export const InvoiceCoverageMonthSchema = Schema.Struct({
  excepted: CountSchema,
  invoiced: CountSchema,
  missing: CountSchema,
  month: MonthSchema,
  payments: CountSchema,
});

export type InvoiceCoverageMonth = typeof InvoiceCoverageMonthSchema.Type;

export const InvoiceCoverageSchema = Schema.Struct({
  months: Schema.Array(InvoiceCoverageMonthSchema),
});

export type InvoiceCoverage = typeof InvoiceCoverageSchema.Type;

export const ReadInvoiceCoverageRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type ReadInvoiceCoverageRequest =
  typeof ReadInvoiceCoverageRequestSchema.Type;

export const InvoiceFileSchema = Schema.Struct({
  amount: Schema.OptionFromNullishOr(AmountSchema),
  contentType: ContentTypeSchema,
  documentDate: DateOnlySchema,
  documentType: DocumentTypeSchema,
  originalFilename: FilenameSchema,
  r2Key: StorageKeySchema,
  sha256: Sha256Schema,
  sizeBytes: SizeBytesSchema,
  source: DocumentSourceSchema,
  sourceRef: Schema.OptionFromNullishOr(
    Schema.String.check(Schema.isMaxLength(1024))
  ),
  vendorPayeeId: Schema.OptionFromNullishOr(PayeeIdSchema),
});

export type InvoiceFile = typeof InvoiceFileSchema.Type;

export const SaveInvoiceFileSchema = Schema.Struct({
  ...InvoiceFileSchema.fields,
  transactionId: TransactionIdSchema,
});

export type SaveInvoiceFile = typeof SaveInvoiceFileSchema.Type;

export const SaveInvoiceFileRequestSchema = Schema.Struct({
  ...SaveInvoiceFileSchema.fields,
  profileId: ProfileIdSchema,
});

export type SaveInvoiceFileRequest = typeof SaveInvoiceFileRequestSchema.Type;

export const LEGACY_FILES_MAX = 200;

export const RegisterLegacyInvoicesSchema = Schema.Struct({
  files: Schema.Array(InvoiceFileSchema).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(LEGACY_FILES_MAX)
  ),
});

export type RegisterLegacyInvoices = typeof RegisterLegacyInvoicesSchema.Type;

export const RegisterLegacyInvoicesRequestSchema = Schema.Struct({
  ...RegisterLegacyInvoicesSchema.fields,
  profileId: ProfileIdSchema,
});

export type RegisterLegacyInvoicesRequest =
  typeof RegisterLegacyInvoicesRequestSchema.Type;

export const LegacyOutcomeSchema = Schema.TaggedUnion({
  Existing: {},
  Stored: {},
});

export type LegacyOutcome = typeof LegacyOutcomeSchema.Type;

export const LegacyFileSchema = Schema.Struct({
  document: InvoiceDocumentSchema,
  outcome: LegacyOutcomeSchema,
});

export type LegacyFile = typeof LegacyFileSchema.Type;

export const LegacyFilesSchema = Schema.Struct({
  files: Schema.Array(LegacyFileSchema),
});

export type LegacyFiles = typeof LegacyFilesSchema.Type;

export const ReadInvoiceDocumentSchema = Schema.Struct({
  documentId: DocumentIdSchema,
});

export type ReadInvoiceDocument = typeof ReadInvoiceDocumentSchema.Type;

export const ReadInvoiceDocumentRequestSchema = Schema.Struct({
  ...ReadInvoiceDocumentSchema.fields,
  profileId: ProfileIdSchema,
});

export type ReadInvoiceDocumentRequest =
  typeof ReadInvoiceDocumentRequestSchema.Type;

export const StoredDocumentSchema = Schema.Struct({
  document: InvoiceDocumentSchema,
  path: Schema.OptionFromNullishOr(Schema.String),
});

export type StoredDocument = typeof StoredDocumentSchema.Type;

export const RemoveInvoiceDocumentSchema = Schema.Struct({
  documentId: DocumentIdSchema,
});

export type RemoveInvoiceDocument = typeof RemoveInvoiceDocumentSchema.Type;

export const RemoveInvoiceDocumentRequestSchema = Schema.Struct({
  ...RemoveInvoiceDocumentSchema.fields,
  profileId: ProfileIdSchema,
});

export type RemoveInvoiceDocumentRequest =
  typeof RemoveInvoiceDocumentRequestSchema.Type;

export const RemovedInvoiceDocumentSchema = Schema.Struct({
  documentId: DocumentIdSchema,
});

export type RemovedInvoiceDocument = typeof RemovedInvoiceDocumentSchema.Type;

export const ArchiveDocumentCursorSchema = Schema.Struct({
  archivedAt: TimestampMillisSchema,
  documentId: DocumentIdSchema,
});

export type ArchiveDocumentCursor = typeof ArchiveDocumentCursorSchema.Type;

export const ARCHIVE_PAGE_LIMIT_MAX = 200;

export const ArchivePageLimitSchema = Schema.Int.check(
  Schema.isBetween({ maximum: ARCHIVE_PAGE_LIMIT_MAX, minimum: 1 })
);

export type ArchivePageLimit = typeof ArchivePageLimitSchema.Type;

export const ListArchivedDocumentsSchema = Schema.Struct({
  cursor: Schema.OptionFromNullishOr(ArchiveDocumentCursorSchema),
  limit: ArchivePageLimitSchema,
});

export type ListArchivedDocuments = typeof ListArchivedDocumentsSchema.Type;

export const ListArchivedDocumentsRequestSchema = Schema.Struct({
  ...ListArchivedDocumentsSchema.fields,
  profileId: ProfileIdSchema,
});

export type ListArchivedDocumentsRequest =
  typeof ListArchivedDocumentsRequestSchema.Type;

export const ArchivedDocumentSchema = Schema.Struct({
  archivedAt: TimestampMillisSchema,
  document: InvoiceDocumentSchema,
  path: Schema.OptionFromNullishOr(Schema.String),
});

export type ArchivedDocument = typeof ArchivedDocumentSchema.Type;

export const ArchivedDocumentsSchema = Schema.Struct({
  documents: Schema.Array(ArchivedDocumentSchema),
  next: Schema.OptionFromNullishOr(ArchiveDocumentCursorSchema),
  total: CountSchema,
});

export type ArchivedDocuments = typeof ArchivedDocumentsSchema.Type;
