import { toRpcGroup } from "@pecunia/capability/rpc-group";
import { Option, Result, Schema } from "effect";
import { expect, it } from "vitest";

import { invoiceCapabilities } from "../src/capabilities.js";
import { invoiceContracts } from "../src/contracts.js";
import {
  ArchiveOutcomeSchema,
  ArchivePlaceIdSchema,
  ArchiveStateSchema,
  AttachInvoiceRequestSchema,
  DeleteInvoiceSourceRequestSchema,
  InvoiceDocumentSchema,
  ListArchivedDocumentsRequestSchema,
  MatchInvoicesRequestSchema,
  ReadArchivePlacesRequestSchema,
  ReadInvoiceStatusRequestSchema,
  RecordInvoiceArchiveRequestSchema,
  RecordInvoiceExceptionRequestSchema,
  RegisterLegacyInvoicesRequestSchema,
  ReserveInvoiceArchiveRequestSchema,
  SaveArchivePlaceRequestSchema,
  SaveInvoiceSourceRequestSchema,
  TimestampMillisSchema,
} from "../src/model.js";
import type { ArchiveState } from "../src/model.js";

const decode = Schema.decodeSync;

const demoProfile = "0192f0c1-0001-702d-8484-48490b729601";

const demoReceipt = "0192f0c1-0038-7d36-85ce-5ceb83cb9775";

const demoPayment = "0192f0c1-0029-768c-8adb-adbefc188d19";

const demoPlace = decode(ArchivePlaceIdSchema)(
  "0192f0c1-0036-72cc-8abe-abebbea44bc0"
);

const attachRequest = {
  documentId: demoReceipt,
  profileId: demoProfile,
  transactionId: demoPayment,
};

const placeRequest = {
  blocklist: ["*.tmp"],
  profileId: demoProfile,
  provider: "local",
  rootRef: "archives/demo",
};

const reserveRequest = {
  documentId: demoReceipt,
  fileId: "demo-file-2",
  placeId: demoPlace,
  profileId: demoProfile,
};

const archivedOutcome = Schema.encodeSync(ArchiveOutcomeSchema)(
  ArchiveOutcomeSchema.cases.Archived.make({})
);

const recordRequest = {
  documentId: demoReceipt,
  outcome: archivedOutcome,
  profileId: demoProfile,
};

const document = {
  amount: { currency: "EUR", minor: 2765 },
  archive: ArchiveStateSchema.cases.Unarchived.make({}),
  contentType: "application/pdf",
  documentDate: "2025-03-11",
  documentType: "receipt",
  id: demoReceipt,
  originalFilename: "demo-design-tool-2025-03.pdf",
  profileId: demoProfile,
  r2Key: "documents/demo-design-tool-2025-03.pdf",
  sha256: "5".repeat(64),
  sizeBytes: 12_288,
  source: "upload",
  sourceRef: null,
  transactionId: null,
  vendorPayeeId: "0192f0c1-000b-7839-88f7-8f744744f3e0",
};

const withoutKey = (
  value: Readonly<Record<string, Schema.Json>>,
  key: string
) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

const encodeArchive = (state: ArchiveState) =>
  Schema.encodeSync(ArchiveStateSchema)(state);

const reservedArchive = encodeArchive(
  ArchiveStateSchema.cases.Reserved.make({
    fileId: "demo-file-2",
    placeId: demoPlace,
  })
);

const archivedArchive = encodeArchive(
  ArchiveStateSchema.cases.Archived.make({
    archivedAt: decode(TimestampMillisSchema)(1_738_659_600_000),
    fileId: "demo-file-2",
    placeId: demoPlace,
  })
);

const failedArchive = encodeArchive(
  ArchiveStateSchema.cases.Failed.make({ reason: "Demo drive refused." })
);

const decodeAttach = (value: Schema.Json) =>
  Schema.decodeUnknownResult(AttachInvoiceRequestSchema)(value);

const decodePlace = (value: Schema.Json) =>
  Schema.decodeUnknownResult(SaveArchivePlaceRequestSchema)(value);

const decodeReserve = (value: Schema.Json) =>
  Schema.decodeUnknownResult(ReserveInvoiceArchiveRequestSchema)(value);

const decodeRecord = (value: Schema.Json) =>
  Schema.decodeUnknownResult(RecordInvoiceArchiveRequestSchema)(value);

const decodeDocument = (value: Schema.Json) =>
  Schema.decodeUnknownResult(InvoiceDocumentSchema)(value);

it("parses each invoice request at the boundary", () => {
  expect(decodeAttach(attachRequest)._tag).toBe("Success");
  expect(decodePlace(placeRequest)._tag).toBe("Success");
  expect(decodeReserve(reserveRequest)._tag).toBe("Success");
  expect(decodeRecord(recordRequest)._tag).toBe("Success");
  expect(decodeDocument(document)._tag).toBe("Success");

  expect(
    Schema.decodeResult(MatchInvoicesRequestSchema)({
      profileId: demoProfile,
    })._tag
  ).toBe("Success");

  expect(
    Schema.decodeResult(ReadArchivePlacesRequestSchema)({
      profileId: demoProfile,
    })._tag
  ).toBe("Success");
});

it("refuses an archive place without a real root or with a repeated entry", () => {
  expect(decodePlace({ ...placeRequest, rootRef: "" })._tag).toBe("Failure");
  expect(decodePlace({ ...placeRequest, rootRef: "   " })._tag).toBe("Failure");
  expect(decodePlace({ ...placeRequest, provider: "dropbox" })._tag).toBe(
    "Failure"
  );
  expect(
    decodePlace({ ...placeRequest, blocklist: ["*.tmp", " *.tmp "] })._tag
  ).toBe("Failure");
  expect(decodePlace({ ...placeRequest, blocklist: ["  "] })._tag).toBe(
    "Failure"
  );
});

it("trims the root reference and keeps the blocklist order", () => {
  const parsed = decodePlace({
    ...placeRequest,
    blocklist: [" drafts ", "exports"],
    rootRef: " archives/demo ",
  });

  expect(Result.isSuccess(parsed)).toBe(true);

  if (Result.isSuccess(parsed)) {
    expect(parsed.success.rootRef).toBe("archives/demo");
    expect(parsed.success.blocklist).toEqual(["drafts", "exports"]);
  }
});

it("refuses a blank archive file id and an unknown archive outcome", () => {
  expect(decodeReserve({ ...reserveRequest, fileId: "  " })._tag).toBe(
    "Failure"
  );

  expect(
    decodeRecord({ ...recordRequest, outcome: reservedArchive })._tag
  ).toBe("Failure");

  expect(
    decodeRecord({
      ...recordRequest,
      outcome: withoutKey(failedArchive, "reason"),
    })._tag
  ).toBe("Failure");

  expect(decodeRecord({ ...recordRequest, outcome: failedArchive })._tag).toBe(
    "Success"
  );
});

it("refuses money that is not an exact integer of minor units", () => {
  expect(
    decodeDocument({ ...document, amount: { currency: "EUR", minor: 27.65 } })
      ._tag
  ).toBe("Failure");

  expect(
    decodeDocument({
      ...document,
      amount: { currency: "EUR", minor: 9_007_199_254_740_992 },
    })._tag
  ).toBe("Failure");

  expect(
    decodeDocument({ ...document, amount: { currency: "eur", minor: 2765 } })
      ._tag
  ).toBe("Failure");

  expect(decodeDocument({ ...document, amount: { minor: 2765 } })._tag).toBe(
    "Failure"
  );

  expect(
    decodeDocument({
      ...document,
      amount: { currency: "EUR", minor: -9_007_199_254_740_991 },
    })._tag
  ).toBe("Success");
});

it("refuses a date that does not exist and a document with no real bytes", () => {
  expect(decodeDocument({ ...document, documentDate: "2025-02-30" })._tag).toBe(
    "Failure"
  );

  expect(decodeDocument({ ...document, documentDate: "2025-3-11" })._tag).toBe(
    "Failure"
  );

  expect(decodeDocument({ ...document, sizeBytes: -1 })._tag).toBe("Failure");

  expect(decodeDocument({ ...document, sha256: "abc" })._tag).toBe("Failure");
});

it("refuses an archive state without the fields that state needs", () => {
  expect(
    decodeDocument({
      ...document,
      archive: withoutKey(reservedArchive, "placeId"),
    })._tag
  ).toBe("Failure");

  expect(
    decodeDocument({
      ...document,
      archive: withoutKey(archivedArchive, "archivedAt"),
    })._tag
  ).toBe("Failure");

  expect(
    decodeDocument({
      ...document,
      archive: withoutKey(failedArchive, "reason"),
    })._tag
  ).toBe("Failure");

  expect(decodeDocument({ ...document, archive: archivedArchive })._tag).toBe(
    "Success"
  );
});

it("projects every invoice contract onto one rpc group", () => {
  const { group } = toRpcGroup(invoiceContracts);

  expect([...group.requests.keys()]).toEqual([
    "attachInvoice",
    "matchInvoices",
    "readArchivePlaces",
    "saveArchivePlace",
    "reserveInvoiceArchive",
    "recordInvoiceArchive",
    "listInvoiceStatus",
    "countInvoiceCoverage",
    "recordInvoiceException",
    "readInvoiceSources",
    "saveInvoiceSource",
    "deleteInvoiceSource",
    "saveInvoiceFile",
    "registerLegacyInvoices",
    "readInvoiceDocument",
    "removeInvoiceDocument",
    "listArchivedDocuments",
  ]);

  expect(
    invoiceCapabilities.map((capability) => capability.contract.name)
  ).toEqual([...group.requests.keys()]);
});

const contractsNamed = (property: "destructive" | "idempotent" | "readOnly") =>
  invoiceContracts
    .filter((contract) => contract.annotations[property])
    .map((contract) => contract.name);

it("marks every read read-only and names the destructive writes", () => {
  expect(contractsNamed("readOnly")).toEqual([
    "matchInvoices",
    "readArchivePlaces",
    "listInvoiceStatus",
    "countInvoiceCoverage",
    "readInvoiceSources",
    "readInvoiceDocument",
    "listArchivedDocuments",
  ]);

  expect(contractsNamed("destructive")).toEqual([
    "deleteInvoiceSource",
    "removeInvoiceDocument",
  ]);

  expect(contractsNamed("idempotent")).toEqual(
    expect.arrayContaining([
      "attachInvoice",
      "matchInvoices",
      "readArchivePlaces",
      "saveArchivePlace",
      "reserveInvoiceArchive",
      "recordInvoiceArchive",
      "listInvoiceStatus",
      "countInvoiceCoverage",
      "recordInvoiceException",
      "readInvoiceSources",
      "saveInvoiceSource",
      "saveInvoiceFile",
      "registerLegacyInvoices",
      "readInvoiceDocument",
      "listArchivedDocuments",
    ])
  );
});

const legacyFile = {
  amount: { currency: "EUR", minor: 1200 },
  contentType: "application/pdf",
  documentDate: "2024-11-04",
  documentType: "invoice",
  originalFilename: "  demo-legacy-2024.pdf ",
  r2Key: "documents/demo-legacy-2024.pdf",
  sha256: "8".repeat(64),
  sizeBytes: 2048,
  source: "legacy_upload",
  sourceRef: null,
  vendorPayeeId: null,
} as const;

const retrieval = {
  bookkeeper: false,
  email: false,
  portal: true,
  twoFactor: false,
} as const;

const decodeSource = (value: typeof SaveInvoiceSourceRequestSchema.Encoded) =>
  Schema.decodeResult(SaveInvoiceSourceRequestSchema)(value);

const decodeArchivePage = (
  value: typeof ListArchivedDocumentsRequestSchema.Encoded
) => Schema.decodeResult(ListArchivedDocumentsRequestSchema)(value);

const decodeDeleteSource = (
  value: typeof DeleteInvoiceSourceRequestSchema.Encoded
) => Schema.decodeResult(DeleteInvoiceSourceRequestSchema)(value);

const decodeLegacy = (
  value: typeof RegisterLegacyInvoicesRequestSchema.Encoded
) => Schema.decodeResult(RegisterLegacyInvoicesRequestSchema)(value);

const decodeStatus = (value: typeof ReadInvoiceStatusRequestSchema.Encoded) =>
  Schema.decodeResult(ReadInvoiceStatusRequestSchema)(value);

const decodeException = (
  value: typeof RecordInvoiceExceptionRequestSchema.Encoded
) => Schema.decodeResult(RecordInvoiceExceptionRequestSchema)(value);

const sourceRequest = {
  loginHint: "  demo@example.com ",
  notes: null,
  pattern: "  Demo Cloud Hosting  ",
  portalUrl: null,
  profileId: demoProfile,
  retrieval,
  vendorPayeeId: null,
};

it("trims and parses an invoice source request at the boundary", () => {
  const parsed = decodeSource(sourceRequest);

  expect(Result.isSuccess(parsed)).toBe(true);

  if (Result.isSuccess(parsed)) {
    expect(parsed.success.pattern).toBe("Demo Cloud Hosting");
    expect(parsed.success.loginHint).toEqual(Option.some("demo@example.com"));
    expect(Option.isNone(parsed.success.vendorPayeeId)).toBe(true);
  }

  const exception = decodeException({
    profileId: demoProfile,
    reason: "  No invoice was issued. ",
    transactionId: demoPayment,
  });

  expect(Result.isSuccess(exception)).toBe(true);

  if (Result.isSuccess(exception)) {
    expect(exception.success.reason).toBe("No invoice was issued.");
  }

  const month = decodeStatus({ month: "2025-03", profileId: demoProfile });

  expect(Result.isSuccess(month)).toBe(true);

  if (Result.isSuccess(month)) {
    expect(month.success.month).toEqual(Option.some("2025-03"));
  }

  const page = decodeArchivePage({
    cursor: { archivedAt: 1_738_659_600_000, documentId: demoReceipt },
    limit: 200,
    profileId: demoProfile,
  });

  expect(Result.isSuccess(page)).toBe(true);

  if (Result.isSuccess(page)) {
    expect(page.success.limit).toBe(200);
  }

  const legacy = decodeLegacy({ files: [legacyFile], profileId: demoProfile });

  expect(Result.isSuccess(legacy)).toBe(true);

  if (Result.isSuccess(legacy)) {
    expect(legacy.success.files[0]?.originalFilename).toBe(
      "demo-legacy-2024.pdf"
    );
  }
});

it("refuses every illegal invoice request at the boundary", () => {
  expect(decodeSource({ ...sourceRequest, pattern: "   " })._tag).toBe(
    "Failure"
  );

  expect(
    decodeException({
      profileId: demoProfile,
      reason: "   ",
      transactionId: demoPayment,
    })._tag
  ).toBe("Failure");

  expect(decodeStatus({ month: "2025-13", profileId: demoProfile })._tag).toBe(
    "Failure"
  );

  expect(
    decodeArchivePage({ cursor: null, limit: 0, profileId: demoProfile })._tag
  ).toBe("Failure");

  expect(
    decodeArchivePage({ cursor: null, limit: 201, profileId: demoProfile })._tag
  ).toBe("Failure");

  expect(
    decodeDeleteSource({ profileId: demoProfile, sourceId: "" })._tag
  ).toBe("Failure");

  expect(decodeLegacy({ files: [], profileId: demoProfile })._tag).toBe(
    "Failure"
  );

  expect(
    decodeLegacy({
      files: [{ ...legacyFile, sha256: "not-a-fingerprint" }],
      profileId: demoProfile,
    })._tag
  ).toBe("Failure");
});
