import { expect, it } from "@effect/vitest";
import { CurrentPerson } from "@pecunia/access";
import { Effect, Layer, Option, Predicate } from "effect";

import { invoiceCapabilities } from "../src/capabilities.js";
import { demoPerson, demoProfileId, demoInvoiceSeed } from "../src/demo.js";
import { InvalidInvoiceRequest } from "../src/invalid-invoice-request.js";
import { memoryInvoiceStoreLayer } from "../src/memory.js";
import { InvoiceService } from "../src/service.js";

const asOwner = Layer.mergeAll(
  InvoiceService.layer.pipe(
    Layer.provide(memoryInvoiceStoreLayer(demoInvoiceSeed))
  ),
  Layer.succeed(CurrentPerson, demoPerson)
);

const repeat = (count: number, char: string) => char.repeat(count);

const goodProfile = demoProfileId;
const goodPayment = "0192f0c1-0029-768c-8adb-adbefc188d19";
const goodDocument = "0192f0c1-0038-7d36-85ce-5ceb83cb9775";
const goodPlace = "0192f0c1-0036-72cc-8abe-abebbea44bc0";
const goodSource = "0192f0c1-0035-7dd0-8aba-aba363f96bd0";
const goodSha = repeat(64, "a");
const goodFile = {
  amount: Option.some({ currency: "EUR", minor: 2400 }),
  contentType: "application/pdf",
  documentDate: "2025-01-15",
  documentType: "invoice" as const,
  originalFilename: "demo-stationery-2025-01.pdf",
  r2Key: "documents/demo-stationery-2025-01.pdf",
  sha256: goodSha,
  sizeBytes: 9001,
  source: "legacy_upload" as const,
  sourceRef: Option.none(),
  vendorPayeeId: Option.none(),
};

const assertRefusal = (error: unknown, field: string) => {
  expect(typeof error).toBe("object");
  expect(error).not.toBeNull();

  if (Predicate.isTagged(error, "InvalidInvoiceRequest")) {
    expect(error.message).toContain("Fix:");
    expect(error.repair).toContain("Fix:");
    expect(error.field.length).toBeGreaterThan(0);
    return;
  }

  if (Predicate.isTagged(error, "InvoiceExceptionRefused")) {
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.repair).toBeDefined();
    return;
  }

  if (Predicate.isTagged(error, "LegacyFilesRefused")) {
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.repair).toBeDefined();
    return;
  }

  if (
    !Predicate.isTagged(error, "InvoiceExceptionRefused") &&
    !Predicate.isTagged(error, "LegacyFilesRefused")
  ) {
    throw new Error(`Expected a tagged refusal, got ${String(error)}`);
  }
};

const runBad = (
  capability: (typeof invoiceCapabilities)[number],
  input: unknown
) =>
  // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- Effect.flip erases each capability failure union in the walk harness.
  capability.handler(input as never).pipe(Effect.flip, Effect.provide(asOwner));

interface BadCase {
  readonly field: string;
  readonly input: unknown;
}

const casesByCapability: Record<string, readonly BadCase[]> = {
  attachInvoice: [
    {
      field: "profileId",
      input: {
        documentId: goodDocument,
        profileId: "",
        transactionId: goodPayment,
      },
    },
    {
      field: "documentId",
      input: {
        documentId: "",
        profileId: goodProfile,
        transactionId: goodPayment,
      },
    },
    {
      field: "transactionId",
      input: {
        documentId: goodDocument,
        profileId: goodProfile,
        transactionId: repeat(65, "t"),
      },
    },
  ],
  countInvoiceCoverage: [{ field: "profileId", input: { profileId: "" } }],
  deleteInvoiceSource: [
    {
      field: "sourceId",
      input: { profileId: goodProfile, sourceId: "" },
    },
  ],
  listArchivedDocuments: [
    {
      field: "limit",
      input: { cursor: Option.none(), limit: 0, profileId: goodProfile },
    },
    {
      field: "limit",
      input: { cursor: Option.none(), limit: 201, profileId: goodProfile },
    },
    {
      field: "cursor",
      input: {
        cursor: Option.some({
          archivedAt: 1,
          documentId: repeat(65, "d"),
        }),
        limit: 10,
        profileId: goodProfile,
      },
    },
  ],
  listInvoiceStatus: [
    {
      field: "month",
      input: { month: Option.some("2025-13"), profileId: goodProfile },
    },
    {
      field: "month",
      input: { month: Option.some("   "), profileId: goodProfile },
    },
  ],
  matchInvoices: [{ field: "profileId", input: { profileId: "" } }],
  readArchivePlaces: [{ field: "profileId", input: { profileId: "" } }],
  readInvoiceDocument: [
    {
      field: "documentId",
      input: { documentId: repeat(65, "d"), profileId: goodProfile },
    },
  ],
  readInvoiceSources: [{ field: "profileId", input: { profileId: "" } }],
  recordInvoiceArchive: [
    {
      field: "outcome",
      input: {
        documentId: goodDocument,
        outcome: { _tag: "Failed", reason: "" },
        profileId: goodProfile,
      },
    },
  ],
  recordInvoiceException: [
    {
      field: "transactionId",
      input: {
        profileId: goodProfile,
        reason: "Paid in cash.",
        transactionId: repeat(65, "p"),
      },
    },
    {
      field: "reason",
      input: {
        profileId: goodProfile,
        reason: "   ",
        transactionId: goodPayment,
      },
    },
    {
      field: "reason",
      input: {
        profileId: goodProfile,
        reason: repeat(10_000, "r"),
        transactionId: goodPayment,
      },
    },
  ],
  registerLegacyInvoices: [
    {
      field: "files",
      input: { files: [], profileId: goodProfile },
    },
    {
      field: "files",
      input: {
        files: Array.from({ length: 201 }, (_, index) => ({
          ...goodFile,
          sha256: `${String(index).padStart(64, "0")}`,
        })),
        profileId: goodProfile,
      },
    },
    {
      field: "files",
      input: {
        files: [{ ...goodFile, originalFilename: repeat(513, "f") }],
        profileId: goodProfile,
      },
    },
  ],
  removeInvoiceDocument: [
    {
      field: "documentId",
      input: { documentId: repeat(65, "d"), profileId: goodProfile },
    },
  ],
  reserveInvoiceArchive: [
    {
      field: "fileId",
      input: {
        documentId: goodDocument,
        fileId: "   ",
        placeId: goodPlace,
        profileId: goodProfile,
      },
    },
  ],
  saveArchivePlace: [
    {
      field: "rootRef",
      input: {
        blocklist: [],
        profileId: goodProfile,
        provider: "local",
        rootRef: "   ",
      },
    },
  ],
  saveInvoiceFile: [
    {
      field: "transactionId",
      input: { ...goodFile, profileId: goodProfile, transactionId: "" },
    },
    {
      field: "originalFilename",
      input: {
        ...goodFile,
        originalFilename: repeat(513, "n"),
        profileId: goodProfile,
        transactionId: goodPayment,
      },
    },
    {
      field: "source",
      input: {
        ...goodFile,
        profileId: goodProfile,
        source: "unknown",
        transactionId: goodPayment,
      },
    },
  ],
  saveInvoiceSource: [
    {
      field: "pattern",
      input: {
        loginHint: Option.none(),
        notes: Option.none(),
        pattern: "   ",
        portalUrl: Option.none(),
        profileId: goodProfile,
        retrieval: {
          bookkeeper: false,
          email: false,
          portal: true,
          twoFactor: false,
        },
        vendorPayeeId: Option.none(),
      },
    },
    {
      field: "pattern",
      input: {
        loginHint: Option.none(),
        notes: Option.none(),
        pattern: repeat(201, "p"),
        portalUrl: Option.none(),
        profileId: goodProfile,
        retrieval: {
          bookkeeper: false,
          email: false,
          portal: true,
          twoFactor: false,
        },
        vendorPayeeId: Option.none(),
      },
    },
  ],
};

// @effect-diagnostics-next-line anyUnknownInErrorContext:off missingEffectContext:off -- the walk iterates every capability failure union through one harness.
it.effect("refuses bad request fields for every invoice capability", () =>
  Effect.gen(function* walkInvoiceCapabilities() {
    for (const capability of invoiceCapabilities) {
      const cases = casesByCapability[capability.contract.name] ?? [];

      if (cases.length === 0) {
        throw new Error(
          `${capability.contract.name} needs at least one bad field case`
        );
      }

      for (const bad of cases) {
        const refused = yield* runBad(capability, bad.input);

        assertRefusal(refused, bad.field);
        if (Predicate.isTagged(refused, "InvalidInvoiceRequest")) {
          expect(refused.capability).toBe(capability.contract.name);
        }
      }
    }
  })
);
