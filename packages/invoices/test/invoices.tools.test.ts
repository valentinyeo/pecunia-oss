import { expect, it } from "@effect/vitest";
import { CurrentPerson, PersonSchema } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { Effect, Layer, Option, Predicate, Schema } from "effect";
import { TestClock } from "effect/testing";

import {
  countInvoiceCoverage,
  deleteInvoiceSource,
  listArchivedDocuments,
  listInvoiceStatus,
  readInvoiceDocument,
  readInvoiceSources,
  recordInvoiceException,
  registerLegacyInvoices,
  removeInvoiceDocument,
  reserveInvoiceArchive,
  saveArchivePlace,
  saveInvoiceFile,
  saveInvoiceSource,
} from "../src/capabilities.js";
import {
  demoArchivePlaces,
  demoDocuments,
  demoInvoiceSeed,
  demoInvoiceSources,
  demoPayments,
  demoPerson,
  demoProfileId,
} from "../src/demo.js";
import type { InvoiceSeed } from "../src/memory.js";
import { memoryInvoiceStoreLayer } from "../src/memory.js";
import {
  AmountSchema,
  ArchivePlaceIdSchema,
  DateOnlySchema,
  DocumentIdSchema,
  InvoiceSourceIdSchema,
  MonthSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  TransactionIdSchema,
} from "../src/model.js";
import type { ArchivePlace, InvoiceDocument, Payment } from "../src/model.js";
import { InvoiceService } from "../src/service.js";

const decode = Schema.decodeSync;

const documentId = (value: string) => decode(DocumentIdSchema)(value);

const transactionId = (value: string) => decode(TransactionIdSchema)(value);

const placeId = (value: string) => decode(ArchivePlaceIdSchema)(value);

const sourceId = (value: string) => decode(InvoiceSourceIdSchema)(value);

const payeeId = (value: string) => decode(PayeeIdSchema)(value);

const demoDesignPayee = payeeId("0192f0c1-000b-7839-88f7-8f744744f3e0");

const month = (value: string) => decode(MonthSchema)(value);

const cloudInvoice = documentId("0192f0c1-0037-7a04-8ca7-ca71e8a2c121");

const designReceipt = documentId("0192f0c1-0038-7d36-85ce-5ceb83cb9775");

const cloudPayment = transactionId("0192f0c1-0028-7018-8357-3578945c907b");

const designPayment = transactionId("0192f0c1-0029-768c-8adb-adbefc188d19");

const coffeePayment = transactionId("0192f0c1-002a-7549-8811-8111b948c159");

const localPlace = placeId("0192f0c1-0036-72cc-8abe-abebbea44bc0");

const demoSource = sourceId("0192f0c1-0035-7dd0-8aba-aba363f96bd0");

const instant = 1_762_160_400_000;

const cloudSha =
  "4444444444444444444444444444444444444444444444444444444444444444";

const designSha =
  "5555555555555555555555555555555555555555555555555555555555555555";

const legacySha =
  "7777777777777777777777777777777777777777777777777777777777777777";

const amountOf = (currency: string, minor: number) =>
  decode(AmountSchema)({ currency, minor });

const dateOf = (value: string) => decode(DateOnlySchema)(value);

const ordinaryFile = {
  amount: Option.some(amountOf("EUR", 2400)),
  contentType: "application/pdf",
  documentDate: dateOf("2025-01-15"),
  documentType: "invoice" as const,
  originalFilename: "demo-stationery-2025-01.pdf",
  r2Key: "documents/demo-stationery-2025-01.pdf",
  sha256: legacySha,
  sizeBytes: 9001,
  source: "legacy_upload" as const,
  sourceRef: Option.none(),
  vendorPayeeId: Option.none(),
};

const layerFor = (person: Person, seed: InvoiceSeed = demoInvoiceSeed) =>
  Layer.mergeAll(
    InvoiceService.layer.pipe(Layer.provide(memoryInvoiceStoreLayer(seed))),
    Layer.succeed(CurrentPerson, person)
  );

const asOwner = layerFor(demoPerson);

const paymentNamed = (payments: readonly Payment[], id: string): Payment => {
  const found = payments.find((payment) => payment.id === id);

  if (found === undefined) {
    throw new Error(`The demo book has no payment at ${id}`);
  }

  return found;
};

const documentNamed = (
  documents: readonly InvoiceDocument[],
  id: string
): InvoiceDocument => {
  const found = documents.find((document) => document.id === id);

  if (found === undefined) {
    throw new Error(`The demo book has no invoice at ${id}`);
  }

  return found;
};

const placeNamed = (
  places: readonly ArchivePlace[],
  id: string
): ArchivePlace => {
  const found = places.find((place) => place.id === id);

  if (found === undefined) {
    throw new Error(`The demo book has no archive place at ${id}`);
  }

  return found;
};

it.effect(
  "counts the outgoing payments that still need an invoice, month by month",
  () =>
    Effect.gen(function* countMissingInvoices() {
      const all = yield* listInvoiceStatus.handler({
        month: Option.none(),
        profileId: demoProfileId,
      });

      expect(all.rows.map((row) => row.transactionId)).toEqual([
        coffeePayment,
        designPayment,
        cloudPayment,
      ]);

      expect(all.missingCount).toBe(1);

      expect(all.rows.map((row) => row.status._tag)).toEqual([
        "Excepted",
        "Missing",
        "Archived",
      ]);

      const march = yield* listInvoiceStatus.handler({
        month: Option.some(month("2025-03")),
        profileId: demoProfileId,
      });

      expect(march.month).toEqual(Option.some(month("2025-03")));
      expect(march.missingCount).toBe(1);
      expect(march.rows).toHaveLength(1);

      const [row] = march.rows;

      if (row === undefined) {
        throw new Error("A month with one missing invoice needs one row");
      }

      expect(row.amount).toEqual({ currency: "USD", minor: 2999 });
      expect(row.merchant).toBe("Demo Design Tool");
      expect(row.paidOn).toBe("2025-03-11");
      expect(Predicate.isTagged(row.status, "Missing")).toBe(true);

      const february = yield* listInvoiceStatus.handler({
        month: Option.some(month("2025-02")),
        profileId: demoProfileId,
      });

      expect(february.missingCount).toBe(0);
      expect(february.rows.map((entry) => entry.sourceId)).toEqual([
        Option.none(),
      ]);

      expect(march.rows.map((entry) => entry.sourceId)).toEqual([
        Option.some(demoSource),
      ]);

      const coverage = yield* countInvoiceCoverage.handler({
        profileId: demoProfileId,
      });

      expect(coverage.months).toEqual([
        { excepted: 1, invoiced: 0, missing: 0, month: "2025-04", payments: 1 },
        { excepted: 0, invoiced: 0, missing: 1, month: "2025-03", payments: 1 },
        { excepted: 0, invoiced: 1, missing: 0, month: "2025-02", payments: 1 },
      ]);

      for (const entry of coverage.months) {
        expect(entry.excepted + entry.invoiced + entry.missing).toBe(
          entry.payments
        );
      }

      const income = paymentNamed(
        demoPayments,
        "0192f0c1-0027-7c11-8261-2619d29e6868"
      );

      expect(income.direction).toBe("in");
      expect(all.rows.some((entry) => entry.transactionId === income.id)).toBe(
        false
      );
    }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("stores a written reason for a payment with no invoice", () =>
  Effect.gen(function* recordTheReason() {
    yield* TestClock.setTime(instant);

    const recorded = yield* recordInvoiceException.handler({
      profileId: demoProfileId,
      reason: "Paid in cash at the counter, and no invoice was issued.",
      transactionId: designPayment,
    });

    expect(recorded.reason).toBe(
      "Paid in cash at the counter, and no invoice was issued."
    );
    expect(recorded.recordedAt).toBe(instant);

    const march = yield* listInvoiceStatus.handler({
      month: Option.some(month("2025-03")),
      profileId: demoProfileId,
    });

    expect(march.missingCount).toBe(0);
    expect(march.rows.map((row) => row.status._tag)).toEqual(["Excepted"]);

    const repeated = yield* recordInvoiceException.handler({
      profileId: demoProfileId,
      reason: "Paid in cash, no invoice.",
      transactionId: designPayment,
    });

    expect(repeated.reason).toBe("Paid in cash, no invoice.");

    const income = paymentNamed(
      demoPayments,
      "0192f0c1-0027-7c11-8261-2619d29e6868"
    );

    const notPayable = yield* Effect.flip(
      recordInvoiceException.handler({
        profileId: demoProfileId,
        reason: "An incoming payment needs no invoice.",
        transactionId: income.id,
      })
    );

    expect(notPayable._tag).toBe("InvoiceNotPayable");

    if (Predicate.isTagged(notPayable, "InvoiceNotPayable")) {
      expect(notPayable.direction).toBe("in");
    }

    const alreadyInvoiced = yield* Effect.flip(
      recordInvoiceException.handler({
        profileId: demoProfileId,
        reason: "The cloud one already has its invoice.",
        transactionId: cloudPayment,
      })
    );

    expect(alreadyInvoiced._tag).toBe("InvoiceAlreadyInvoiced");

    if (Predicate.isTagged(alreadyInvoiced, "InvoiceAlreadyInvoiced")) {
      expect(alreadyInvoiced.documentId).toBe(cloudInvoice);
      expect(alreadyInvoiced.transactionId).toBe(cloudPayment);
    }
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

const overlongReason = "x".repeat(10_000);

const reasonAtLimit = "y".repeat(500);

it.effect(
  "refuses a blank or overlong reason by name and stores one at the limit",
  () =>
    Effect.gen(function* refuseBadReasons() {
      yield* TestClock.setTime(instant);

      const blank = yield* Effect.flip(
        recordInvoiceException.handler({
          profileId: demoProfileId,
          reason: "   ",
          transactionId: designPayment,
        })
      );

      expect(blank._tag).toBe("InvoiceExceptionRefused");

      if (Predicate.isTagged(blank, "InvoiceExceptionRefused")) {
        expect(blank.reasonLength).toBe(0);
        expect(blank.message).toContain("empty");
        expect(blank.repair).toContain("no invoice");
      }

      const overlong = yield* Effect.flip(
        recordInvoiceException.handler({
          profileId: demoProfileId,
          reason: overlongReason,
          transactionId: designPayment,
        })
      );

      expect(overlong._tag).toBe("InvoiceExceptionRefused");

      if (Predicate.isTagged(overlong, "InvoiceExceptionRefused")) {
        expect(overlong.reasonLength).toBe(10_000);
        expect(overlong.message).toContain("10000 characters long");
        expect(overlong.message).toContain("limit is 500");
        expect(overlong.repair).toContain("500 characters or fewer");
      }

      const stored = yield* recordInvoiceException.handler({
        profileId: demoProfileId,
        reason: reasonAtLimit,
        transactionId: designPayment,
      });

      expect(stored.reason).toBe(reasonAtLimit);
      expect(stored.recordedAt).toBe(instant);

      const march = yield* listInvoiceStatus.handler({
        month: Option.some(month("2025-03")),
        profileId: demoProfileId,
      });

      expect(march.missingCount).toBe(0);
      expect(march.rows.map((row) => row.status._tag)).toEqual(["Excepted"]);
    }).pipe(Effect.provide(asOwner), Effect.orDie)
);

const fingerprintOf = (index: number): string =>
  `${String(index).padStart(12, "0")}${"a1b2c3d4e5f6".repeat(5).slice(0, 52)}`;

const legacyBatchOf = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    ...ordinaryFile,
    originalFilename: `demo-legacy-${index}.pdf`,
    r2Key: `documents/demo-legacy-${index}.pdf`,
    sha256: fingerprintOf(index),
  }));

it.effect("registers 200 legacy files and refuses a batch of 201 by name", () =>
  Effect.gen(function* refuseTheOversizedBatch() {
    const atLimit = yield* registerLegacyInvoices.handler({
      files: legacyBatchOf(200),
      profileId: demoProfileId,
    });

    expect(atLimit.files).toHaveLength(200);
    expect(atLimit.files.map((file) => file.outcome._tag)).toEqual(
      Array.from({ length: 200 }, () => "Stored")
    );

    const tooMany = legacyBatchOf(201);

    const refused = yield* Effect.flip(
      registerLegacyInvoices.handler({
        files: tooMany,
        profileId: demoProfileId,
      })
    );

    expect(refused._tag).toBe("LegacyFilesRefused");

    if (Predicate.isTagged(refused, "LegacyFilesRefused")) {
      expect(refused.count).toBe(201);
      expect(refused.message).toContain("201 files");
      expect(refused.message).toContain("limit is 200");
      expect(refused.repair).toContain("batches of 200");
    }

    const last = tooMany.at(-1) ?? ordinaryFile;

    const untouched = yield* registerLegacyInvoices.handler({
      files: [last],
      profileId: demoProfileId,
    });

    expect(untouched.files.map((file) => file.outcome._tag)).toEqual([
      "Stored",
    ]);
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("stores one invoice file per fingerprint and attaches it", () =>
  Effect.gen(function* storeTheInvoiceFile() {
    const stored = yield* saveInvoiceFile.handler({
      ...ordinaryFile,
      profileId: demoProfileId,
      sha256: designSha,
      transactionId: designPayment,
      vendorPayeeId: Option.none(),
    });

    expect(stored.id).toBe(designReceipt);
    expect(Option.getOrUndefined(stored.transactionId)).toBe(designPayment);
    expect(Option.getOrUndefined(stored.amount)).toEqual({
      currency: "EUR",
      minor: 2765,
    });
    expect(stored.sha256).toBe(designSha);

    const again = yield* saveInvoiceFile.handler({
      ...ordinaryFile,
      profileId: demoProfileId,
      sha256: designSha,
      transactionId: designPayment,
      vendorPayeeId: Option.none(),
    });

    expect(again.id).toBe(designReceipt);

    const march = yield* listInvoiceStatus.handler({
      month: Option.some(month("2025-03")),
      profileId: demoProfileId,
    });

    expect(march.missingCount).toBe(0);
    expect(march.rows.map((row) => row.status._tag)).toEqual(["Invoiced"]);

    const wrongPayment = yield* Effect.flip(
      saveInvoiceFile.handler({
        ...ordinaryFile,
        profileId: demoProfileId,
        sha256: designSha,
        transactionId: cloudPayment,
        vendorPayeeId: Option.none(),
      })
    );

    expect(wrongPayment._tag).toBe("InvoiceAlreadyAttached");

    const fresh = yield* saveInvoiceFile.handler({
      ...ordinaryFile,
      profileId: demoProfileId,
      transactionId: coffeePayment,
      vendorPayeeId: Option.none(),
    });

    expect(fresh.id).not.toBe(designReceipt);
    expect(fresh.sha256).toBe(legacySha);
    expect(Option.getOrUndefined(fresh.transactionId)).toBe(coffeePayment);

    const april = yield* listInvoiceStatus.handler({
      month: Option.some(month("2025-04")),
      profileId: demoProfileId,
    });

    expect(april.missingCount).toBe(0);
    expect(april.rows.map((row) => row.status._tag)).toEqual(["Invoiced"]);
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("registers legacy files once per fingerprint", () =>
  Effect.gen(function* registerTheLegacyFiles() {
    const first = yield* registerLegacyInvoices.handler({
      files: [
        { ...ordinaryFile, sha256: legacySha },
        {
          ...ordinaryFile,
          originalFilename: "demo-cloud-2025-02.pdf",
          sha256: cloudSha,
        },
        {
          ...ordinaryFile,
          originalFilename: "demo-legacy-duplicate.pdf",
          sha256: legacySha,
        },
      ],
      profileId: demoProfileId,
    });

    expect(first.files.map((file) => file.outcome._tag)).toEqual([
      "Stored",
      "Existing",
      "Existing",
    ]);

    expect(first.files[1]?.document.id).toBe(cloudInvoice);
    expect(first.files[2]?.document.id).toBe(first.files[0]?.document.id);

    const second = yield* registerLegacyInvoices.handler({
      files: [{ ...ordinaryFile, sha256: legacySha }],
      profileId: demoProfileId,
    });

    expect(second.files.map((file) => file.outcome._tag)).toEqual(["Existing"]);
    expect(second.files[0]?.document.id).toBe(first.files[0]?.document.id);

    const attached = second.files[0]?.document;

    expect(attached).toBeDefined();

    if (attached !== undefined) {
      expect(Option.isNone(attached.transactionId)).toBe(true);
    }
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("reads one stored file and its place in the folder tree", () =>
  Effect.gen(function* readTheStoredFile() {
    const archived = yield* readInvoiceDocument.handler({
      documentId: cloudInvoice,
      profileId: demoProfileId,
    });

    expect(archived.document.id).toBe(cloudInvoice);
    expect(archived.document.contentType).toBe("application/pdf");
    expect(archived.document.sizeBytes).toBe(24_576);
    expect(archived.path).toEqual(
      Option.some(
        "demo-archive/2025/02/444444444444-demo-cloud-hosting-2025-02.pdf"
      )
    );

    const unarchived = yield* readInvoiceDocument.handler({
      documentId: designReceipt,
      profileId: demoProfileId,
    });

    expect(Option.isNone(unarchived.path)).toBe(true);

    const documents = yield* listArchivedDocuments.handler({
      cursor: Option.none(),
      limit: 10,
      profileId: demoProfileId,
    });

    expect(documents.total).toBe(1);
    expect(documents.documents.map((row) => row.document.id)).toEqual([
      cloudInvoice,
    ]);
    expect(documents.documents[0]?.archivedAt).toBe(1_738_659_600_000);
    expect(Option.isNone(documents.next)).toBe(true);

    const removed = yield* removeInvoiceDocument.handler({
      documentId: designReceipt,
      profileId: demoProfileId,
    });

    expect(removed.documentId).toBe(designReceipt);

    const gone = yield* Effect.flip(
      readInvoiceDocument.handler({
        documentId: designReceipt,
        profileId: demoProfileId,
      })
    );

    expect(gone._tag).toBe("UnknownInvoice");

    const afterRemoval = yield* listInvoiceStatus.handler({
      month: Option.some(month("2025-03")),
      profileId: demoProfileId,
    });

    expect(afterRemoval.missingCount).toBe(1);
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("says where each vendor's invoices come from", () =>
  Effect.gen(function* keepTheInvoiceSources() {
    const read = yield* readInvoiceSources.handler({
      profileId: demoProfileId,
    });

    expect(read.sources.map((source) => source.id)).toEqual([demoSource]);
    expect(read.sources[0]?.pattern).toBe("Demo Design Tool");
    expect(read.sources[0]?.retrieval.portal).toBe(true);
    expect(read.sources[0]?.retrieval.twoFactor).toBe(true);
    expect(read.sources[0]?.portalUrl).toEqual(
      Option.some("https://portal.example.com")
    );

    const saved = yield* saveInvoiceSource.handler({
      loginHint: Option.none(),
      notes: Option.some("Ask the bookkeeper for the PDF."),
      pattern: "Example Design Tool",
      portalUrl: Option.none(),
      profileId: demoProfileId,
      retrieval: {
        bookkeeper: true,
        email: false,
        portal: false,
        twoFactor: false,
      },
      vendorPayeeId: Option.some(demoDesignPayee),
    });

    expect(saved.pattern).toBe("Example Design Tool");

    const repeated = yield* saveInvoiceSource.handler({
      loginHint: Option.some("demo@example.com"),
      notes: Option.none(),
      pattern: "Example Design Tool",
      portalUrl: Option.none(),
      profileId: demoProfileId,
      retrieval: {
        bookkeeper: false,
        email: true,
        portal: false,
        twoFactor: false,
      },
      vendorPayeeId: Option.none(),
    });

    expect(repeated.id).toBe(saved.id);

    const unknownVendor = yield* Effect.flip(
      saveInvoiceSource.handler({
        loginHint: Option.none(),
        notes: Option.none(),
        pattern: "Unknown Vendor",
        portalUrl: Option.none(),
        profileId: demoProfileId,
        retrieval: {
          bookkeeper: false,
          email: false,
          portal: false,
          twoFactor: false,
        },
        vendorPayeeId: Option.some(payeeId("payee-not-on-the-statement")),
      })
    );

    expect(unknownVendor._tag).toBe("UnknownVendorPayee");

    const deleted = yield* deleteInvoiceSource.handler({
      profileId: demoProfileId,
      sourceId: saved.id,
    });

    expect(deleted.sourceId).toBe(saved.id);

    const gone = yield* Effect.flip(
      deleteInvoiceSource.handler({
        profileId: demoProfileId,
        sourceId: saved.id,
      })
    );

    expect(gone._tag).toBe("UnknownInvoiceSource");

    expect(demoInvoiceSources.map((source) => source.pattern)).toEqual([
      "Demo Design Tool",
    ]);
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("refuses to archive a file into a blocked folder", () =>
  Effect.gen(function* blockTheArchivePath() {
    const place = yield* saveArchivePlace.handler({
      blocklist: ["*.pdf"],
      profileId: demoProfileId,
      provider: "drive",
      rootRef: " demo-drive/ ",
    });

    const blocked = yield* Effect.flip(
      reserveInvoiceArchive.handler({
        documentId: designReceipt,
        fileId: "demo-file-3",
        placeId: place.id,
        profileId: demoProfileId,
      })
    );

    expect(blocked._tag).toBe("ArchivePathBlocked");

    if (Predicate.isTagged(blocked, "ArchivePathBlocked")) {
      expect(blocked.entry).toBe("*.pdf");
      expect(blocked.path).toBe(
        "demo-drive/2025/03/555555555555-demo-design-tool-2025-03.pdf"
      );
    }

    const local = placeNamed(demoArchivePlaces, localPlace);

    expect(local.rootRef).toBe("demo-archive");
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

const viewerPerson = decode(PersonSchema)({
  email: "finance@example.com",
  memberships: [{ profileId: demoProfileId, role: "viewer" }],
  personId: "person-viewer",
});

it.effect("shows a viewer the status and refuses a viewer's write", () =>
  Effect.gen(function* guardTheViewer() {
    const status = yield* listInvoiceStatus.handler({
      month: Option.none(),
      profileId: demoProfileId,
    });

    expect(status.missingCount).toBe(1);

    const coverage = yield* countInvoiceCoverage.handler({
      profileId: demoProfileId,
    });

    expect(coverage.months).toHaveLength(3);

    const write = yield* Effect.flip(
      recordInvoiceException.handler({
        profileId: demoProfileId,
        reason: "A viewer cannot write this.",
        transactionId: designPayment,
      })
    );

    expect(write._tag).toBe("Forbidden");
  }).pipe(Effect.provide(layerFor(viewerPerson)), Effect.orDie)
);

const strangerProfileId = decode(ProfileIdSchema)("profile-stranger");

const strangerPerson = decode(PersonSchema)({
  email: "stranger@example.com",
  memberships: [{ profileId: strangerProfileId, role: "owner" }],
  personId: "person-stranger",
});

it.effect("gives another profile no rows and no payment by name", () =>
  Effect.gen(function* guardTheProfile() {
    const refusal = yield* Effect.flip(
      recordInvoiceException.handler({
        profileId: strangerProfileId,
        reason: "Another profile's payment.",
        transactionId: cloudPayment,
      })
    );

    expect(refusal._tag).toBe("UnknownPayment");

    const documents = yield* listArchivedDocuments.handler({
      cursor: Option.none(),
      limit: 10,
      profileId: strangerProfileId,
    });

    expect(documents.total).toBe(0);
    expect(documents.documents).toEqual([]);

    const status = yield* listInvoiceStatus.handler({
      month: Option.none(),
      profileId: strangerProfileId,
    });

    expect(status.rows).toEqual([]);
    expect(status.missingCount).toBe(0);

    expect(documentNamed(demoDocuments, cloudInvoice).id).toBe(cloudInvoice);
  }).pipe(Effect.provide(layerFor(strangerPerson)), Effect.orDie)
);
