import { expect, it } from "@effect/vitest";
import { CurrentPerson } from "@pecunia/access";
import { Effect, Layer, Schema } from "effect";

import { invoiceCapabilities } from "../src/capabilities.js";
import { demoPerson, demoProfileId, demoInvoiceSeed } from "../src/demo.js";
import { InvalidInvoiceRequest } from "../src/invalid-invoice-request.js";
import { InvoiceExceptionRefused } from "../src/invoice-exception-refused.js";
import { LegacyFilesRefused } from "../src/legacy-files-refused.js";
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

const goodSha = repeat(64, "a");

const wireGoodFile = {
  amount: { currency: "EUR", minor: 2400 },
  contentType: "application/pdf",
  documentDate: "2025-01-15",
  documentType: "invoice" as const,
  originalFilename: "demo-stationery-2025-01.pdf",
  r2Key: "documents/demo-stationery-2025-01.pdf",
  sha256: goodSha,
  sizeBytes: 9001,
  source: "legacy_upload" as const,
  sourceRef: null,
  vendorPayeeId: null,
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Schema.is narrows each tagged failure after Effect.flip.
const assertRefusal = (error: unknown, field: string): void => {
  if (Schema.is(InvalidInvoiceRequest)(error)) {
    expect(error.field).toBe(field);
    expect(error.problem.length).toBeGreaterThan(0);
    expect(error.fix.startsWith("Fix:")).toBe(true);
    expect(error.problem.toLowerCase()).not.toContain("blank");

    return;
  }

  if (Schema.is(InvoiceExceptionRefused)(error)) {
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.repair).toBeDefined();

    return;
  }

  if (Schema.is(LegacyFilesRefused)(error)) {
    expect(error.message.length).toBeGreaterThan(0);
    expect(error.repair).toBeDefined();

    return;
  }

  throw new Error(`Expected a tagged refusal, got ${String(error)}`);
};

interface BadCase {
  readonly field: string;
  readonly input: unknown;
}

const casesByCapability = {
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
      input: { cursor: null, limit: 0, profileId: goodProfile },
    },
    {
      field: "limit",
      input: { cursor: null, limit: 201, profileId: goodProfile },
    },
    {
      field: "limit",
      input: { cursor: null, limit: 1.5, profileId: goodProfile },
    },
    {
      field: "limit",
      input: { cursor: null, limit: -1, profileId: goodProfile },
    },
    {
      field: "cursor.documentId",
      input: {
        cursor: {
          archivedAt: 1,
          documentId: repeat(65, "d"),
        },
        limit: 10,
        profileId: goodProfile,
      },
    },
  ],
  listInvoiceStatus: [
    {
      field: "month",
      input: { month: "2025-13", profileId: goodProfile },
    },
    {
      field: "month",
      input: { month: "   ", profileId: goodProfile },
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
      field: "outcome.reason",
      input: {
        documentId: goodDocument,
        outcome: { _tag: "Failed", reason: "" }, // oxlint-disable-line anti-slop-effect/no-manual-tagged-construction -- wire JSON for ArchiveOutcomeSchema before decode.
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
        transactionId: "",
      },
    },
    {
      field: "transactionId",
      input: {
        profileId: goodProfile,
        reason: "Paid in cash.",
        transactionId: repeat(65, "p"),
      },
    },
    {
      field: "transactionId",
      input: {
        profileId: goodProfile,
        reason: "Paid in cash.",
        transactionId: 42,
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
          ...wireGoodFile,
          sha256: String(index).padStart(64, "0"),
        })),
        profileId: goodProfile,
      },
    },
    {
      field: "files.0.originalFilename",
      input: {
        files: [{ ...wireGoodFile, originalFilename: repeat(513, "f") }],
        profileId: goodProfile,
      },
    },
    {
      field: "files.0.amount.minor",
      input: {
        files: [
          {
            ...wireGoodFile,
            amount: { currency: "EUR", minor: 10.5 },
          },
        ],
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
      input: { ...wireGoodFile, profileId: goodProfile, transactionId: "" },
    },
    {
      field: "originalFilename",
      input: {
        ...wireGoodFile,
        originalFilename: repeat(513, "n"),
        profileId: goodProfile,
        transactionId: goodPayment,
      },
    },
    {
      field: "amount.minor",
      input: {
        ...wireGoodFile,
        amount: { currency: "EUR", minor: 1.5 },
        profileId: goodProfile,
        transactionId: goodPayment,
      },
    },
    {
      field: "source",
      input: {
        ...wireGoodFile,
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
        loginHint: null,
        notes: null,
        pattern: "   ",
        portalUrl: null,
        profileId: goodProfile,
        retrieval: {
          bookkeeper: false,
          email: false,
          portal: true,
          twoFactor: false,
        },
        vendorPayeeId: null,
      },
    },
    {
      field: "pattern",
      input: {
        loginHint: null,
        notes: null,
        pattern: repeat(201, "p"),
        portalUrl: null,
        profileId: goodProfile,
        retrieval: {
          bookkeeper: false,
          email: false,
          portal: true,
          twoFactor: false,
        },
        vendorPayeeId: null,
      },
    },
  ],
} satisfies Record<string, readonly BadCase[]>;

type WalkHandler = (
  input: never
) => Effect.Effect<unknown, unknown, CurrentPerson | InvoiceService>;

const runBad = (
  handler: WalkHandler,
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the walk drives wire JSON through each capability handler.
  input: unknown
) =>
  // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- heterogeneous tagged failures are inspected after flip.
  handler(
    // SAFETY: `implement` erases each capability's input type; the walk only sends wire JSON.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- same invariant as the SAFETY comment above.
    input as never
  ).pipe(Effect.flip, Effect.provide(asOwner));

it.effect("refuses bad request fields for every invoice capability", () =>
  Effect.gen(function* walkInvoiceCapabilities() {
    for (const capability of invoiceCapabilities) {
      const capabilityName = capability.contract.name;

      if (!Object.hasOwn(casesByCapability, capabilityName)) {
        throw new Error(`${capabilityName} needs at least one bad field case`);
      }

      const caseList = casesByCapability[capabilityName];

      for (const bad of caseList) {
        // @effect-diagnostics-next-line anyUnknownInErrorContext:off -- `Schema.is` narrows each tagged refusal before assertions.
        const refused: unknown = yield* runBad(capability.handler, bad.input);

        assertRefusal(refused, bad.field);

        if (Schema.is(InvalidInvoiceRequest)(refused)) {
          expect(refused.capability).toBe(capability.contract.name);
        }
      }
    }
  })
);
