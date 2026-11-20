import { PersonSchema, ProfileIdSchema } from "@pecunia/access";
import { Option, Schema } from "effect";

import type { InvoiceSeed } from "./memory.js";
import {
  AmountSchema,
  ArchivePlaceIdSchema,
  ArchiveStateSchema,
  DateOnlySchema,
  DocumentIdSchema,
  InvoiceSourceIdSchema,
  PayeeIdSchema,
  TimestampMillisSchema,
  TransactionIdSchema,
} from "./model.js";
import type {
  ArchivePlace,
  InvoiceDocument,
  InvoiceException,
  InvoiceSource,
  Payment,
} from "./model.js";

const decode = Schema.decodeSync;

export const demoProfileId = decode(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

export const demoPerson = decode(PersonSchema)({
  email: "demo@example.com",
  memberships: [{ profileId: demoProfileId, role: "owner" }],
  personId: "person-demo",
});

const amountOf = (currency: string, minor: number) =>
  decode(AmountSchema)({ currency, minor });

const placeIdOf = (value: string) => decode(ArchivePlaceIdSchema)(value);

const documentIdOf = (value: string) => decode(DocumentIdSchema)(value);

const transactionIdOf = (value: string) => decode(TransactionIdSchema)(value);

const payeeIdOf = (value: string) => decode(PayeeIdSchema)(value);

const sourceIdOf = (value: string) => decode(InvoiceSourceIdSchema)(value);

const dateOf = (value: string) => decode(DateOnlySchema)(value);

const instantOf = (value: number) => decode(TimestampMillisSchema)(value);

const demoLocalPlaceId = placeIdOf("0192f0c1-0036-72cc-8abe-abebbea44bc0");

const demoCloudPayeeId = payeeIdOf("0192f0c1-0009-71f7-8998-998f8330df68");

const demoDesignPayeeId = payeeIdOf("0192f0c1-000b-7839-88f7-8f744744f3e0");

const demoClientPayeeId = payeeIdOf("0192f0c1-0008-7e52-8fb0-fb052d752a6a");

export const demoPayments: readonly Payment[] = [
  {
    amount: amountOf("EUR", 480_000),
    direction: "in",
    id: transactionIdOf("0192f0c1-0027-7c11-8261-2619d29e6868"),
    merchant: "Example Client Ltd",
    paidOn: dateOf("2025-01-06"),
    payeeId: Option.some(demoClientPayeeId),
    profileId: demoProfileId,
  },
  {
    amount: amountOf("EUR", 4250),
    direction: "out",
    id: transactionIdOf("0192f0c1-002a-7549-8811-8111b948c159"),
    merchant: "Demo Coffee",
    paidOn: dateOf("2025-04-02"),
    payeeId: Option.some(payeeIdOf("0192f0c1-000a-743c-890f-90fb094546ce")),
    profileId: demoProfileId,
  },
  {
    amount: amountOf("EUR", 299_000),
    direction: "out",
    id: transactionIdOf("0192f0c1-0028-7018-8357-3578945c907b"),
    merchant: "Demo Cloud Hosting",
    paidOn: dateOf("2025-02-03"),
    payeeId: Option.some(demoCloudPayeeId),
    profileId: demoProfileId,
  },
  {
    amount: amountOf("USD", 2999),
    direction: "out",
    id: transactionIdOf("0192f0c1-0029-768c-8adb-adbefc188d19"),
    merchant: "Demo Design Tool",
    paidOn: dateOf("2025-03-11"),
    payeeId: Option.some(demoDesignPayeeId),
    profileId: demoProfileId,
  },
];

export const demoArchivePlaces: readonly ArchivePlace[] = [
  {
    blocklist: ["*.tmp"],
    id: demoLocalPlaceId,
    profileId: demoProfileId,
    provider: "local",
    rootRef: "demo-archive",
  },
];

export const demoDocuments: readonly InvoiceDocument[] = [
  {
    amount: Option.some(amountOf("EUR", 299_000)),
    archive: ArchiveStateSchema.cases.Archived.make({
      archivedAt: instantOf(1_738_659_600_000),
      fileId: "demo-file-1",
      placeId: demoLocalPlaceId,
    }),
    contentType: "application/pdf",
    documentDate: dateOf("2025-02-03"),
    documentType: "invoice",
    id: documentIdOf("0192f0c1-0037-7a04-8ca7-ca71e8a2c121"),
    originalFilename: "demo-cloud-hosting-2025-02.pdf",
    profileId: demoProfileId,
    r2Key: "documents/demo-cloud-hosting-2025-02.pdf",
    sha256: "4444444444444444444444444444444444444444444444444444444444444444",
    sizeBytes: 24_576,
    source: "email",
    sourceRef: Option.some("demo-inbox-1"),
    transactionId: Option.some(
      transactionIdOf("0192f0c1-0028-7018-8357-3578945c907b")
    ),
    vendorPayeeId: Option.some(demoCloudPayeeId),
  },
  {
    amount: Option.some(amountOf("EUR", 2765)),
    archive: ArchiveStateSchema.cases.Unarchived.make({}),
    contentType: "application/pdf",
    documentDate: dateOf("2025-03-11"),
    documentType: "receipt",
    id: documentIdOf("0192f0c1-0038-7d36-85ce-5ceb83cb9775"),
    originalFilename: "demo-design-tool-2025-03.pdf",
    profileId: demoProfileId,
    r2Key: "documents/demo-design-tool-2025-03.pdf",
    sha256: "5555555555555555555555555555555555555555555555555555555555555555",
    sizeBytes: 12_288,
    source: "upload",
    sourceRef: Option.none(),
    transactionId: Option.none(),
    vendorPayeeId: Option.some(demoDesignPayeeId),
  },
];

export const demoInvoiceExceptions: readonly InvoiceException[] = [
  {
    profileId: demoProfileId,
    reason: "Waiting for the demo vendor receipt.",
    recordedAt: instantOf(1_744_189_200_000),
    transactionId: transactionIdOf("0192f0c1-002a-7549-8811-8111b948c159"),
  },
];

export const demoInvoiceSources: readonly InvoiceSource[] = [
  {
    id: sourceIdOf("0192f0c1-0035-7dd0-8aba-aba363f96bd0"),
    loginHint: Option.some("demo@example.com"),
    notes: Option.some("Demo vendor portal."),
    pattern: "Demo Design Tool",
    portalUrl: Option.some("https://portal.example.com"),
    profileId: demoProfileId,
    retrieval: {
      bookkeeper: false,
      email: true,
      portal: true,
      twoFactor: true,
    },
    vendorPayeeId: Option.some(demoDesignPayeeId),
  },
];

export const demoInvoiceSeed: InvoiceSeed = {
  documents: demoDocuments,
  exceptions: demoInvoiceExceptions,
  payments: demoPayments,
  places: demoArchivePlaces,
  sources: demoInvoiceSources,
};
