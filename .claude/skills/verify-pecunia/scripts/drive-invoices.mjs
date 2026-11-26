#!/usr/bin/env node
import { createHash } from "node:crypto";

import { Effect, Layer, Option } from "effect";

import { CurrentPerson } from "../../../../packages/access/dist/index.js";
import {
  attachInvoice,
  countInvoiceCoverage,
  deleteInvoiceSource,
  listArchivedDocuments,
  listInvoiceStatus,
  matchInvoices,
  readArchivePlaces,
  readInvoiceDocument,
  readInvoiceSources,
  recordInvoiceArchive,
  recordInvoiceException,
  registerLegacyInvoices,
  removeInvoiceDocument,
  reserveInvoiceArchive,
  saveArchivePlace,
  saveInvoiceFile,
  saveInvoiceSource,
} from "../../../../packages/invoices/dist/capabilities.js";
import {
  demoArchivePlaces,
  demoDocuments,
  demoInvoiceSeed,
  demoInvoiceSources,
  demoPayments,
  demoPerson,
  demoProfileId,
} from "../../../../packages/invoices/dist/demo.js";
import { memoryInvoiceStoreLayer } from "../../../../packages/invoices/dist/memory.js";
import { ArchiveOutcomeSchema } from "../../../../packages/invoices/dist/model.js";
import { InvoiceService } from "../../../../packages/invoices/dist/service.js";
import { InvoiceStore } from "../../../../packages/invoices/dist/store.js";
import { countingLayer, mutationRecorder } from "./lib/mutating-adapter.mjs";
import { observe } from "./lib/observation.mjs";

const recorder = mutationRecorder();

const store = countingLayer({
  layer: memoryInvoiceStoreLayer(demoInvoiceSeed),
  mutations: [
    "createDocument",
    "deleteDocument",
    "deleteSource",
    "saveDocument",
    "saveException",
    "savePlace",
    "saveSource",
  ],
  recorder,
  service: InvoiceStore,
});

const world = Layer.mergeAll(
  InvoiceService.layer.pipe(Layer.provide(store)),
  Layer.succeed(CurrentPerson, demoPerson)
);

const request = { profileId: demoProfileId };

const statusRequest = { ...request, month: Option.none() };

const [, receipt] = demoDocuments;

const coffee = demoPayments.find(
  (payment) => payment.merchant === "Demo Coffee"
);

const design = demoPayments.find(
  (payment) => payment.merchant === "Demo Design Tool"
);

const [localPlace] = demoArchivePlaces;

const [source] = demoInvoiceSources;

const bytes = Buffer.from("Demo invoice for verification.\n");

const sha256 = createHash("sha256").update(bytes).digest("hex");

const file = {
  amount: { currency: "EUR", minor: 4250 },
  contentType: "text/plain",
  documentDate: "2025-04-02",
  documentType: "receipt",
  originalFilename: "demo-verify.txt",
  r2Key: "documents/demo-verify.txt",
  sha256,
  sizeBytes: bytes.length,
  source: "upload",
  sourceRef: null,
  vendorPayeeId: Option.getOrNull(coffee.payeeId),
};

const legacyBytes = Buffer.from("Demo legacy invoice for verification.\n");

const legacyFile = {
  ...file,
  amount: null,
  originalFilename: "demo-legacy.txt",
  r2Key: "documents/demo-legacy.txt",
  sha256: createHash("sha256").update(legacyBytes).digest("hex"),
  sizeBytes: legacyBytes.length,
  source: "legacy_upload",
};

const statusText = (page) =>
  `missing=${page.missingCount} ${page.rows.map((row) => `${row.merchant}:${row.status._tag}`).join(",")}`;

const placeRecords = (page) =>
  page.places.map((row) => ({
    blocklist: [...row.blocklist],
    id: row.id,
    profileId: row.profileId,
    provider: row.provider,
    rootRef: row.rootRef,
  }));

const documentRecord = (stored) => {
  const { document } = stored;
  const amount = Option.getOrNull(document.amount);

  return {
    amountCurrency: amount?.currency ?? null,
    amountMinor: amount?.minor ?? null,
    archiveFileId:
      document.archive._tag === "Reserved" ||
      document.archive._tag === "Archived"
        ? document.archive.fileId
        : null,
    archivePlaceId:
      document.archive._tag === "Reserved" ||
      document.archive._tag === "Archived"
        ? document.archive.placeId
        : null,
    archiveStamped:
      document.archive._tag === "Archived" &&
      Number.isSafeInteger(document.archive.archivedAt),
    archiveState: document.archive._tag,
    id: document.id,
    originalFilename: document.originalFilename,
    path: Option.getOrNull(stored.path),
    profileId: document.profileId,
    sha256: document.sha256,
    sizeBytes: document.sizeBytes,
    transactionId: Option.getOrNull(document.transactionId),
  };
};

const statusRecords = (page) =>
  page.rows.map((row) => ({
    id: row.transactionId,
    merchant: row.merchant,
    missingCount: page.missingCount,
    profileId: demoProfileId,
    reason: row.status._tag === "Excepted" ? row.status.reason : null,
    status: row.status._tag,
  }));

const sourceRecords = (page) =>
  page.sources.map((row) => ({
    emailRetrieval: row.retrieval.email,
    id: row.id,
    notes: Option.getOrNull(row.notes),
    pattern: row.pattern,
    portalRetrieval: row.retrieval.portal,
    portalUrl: Option.getOrNull(row.portalUrl),
    profileId: row.profileId,
    twoFactor: row.retrieval.twoFactor,
  }));

const observations = await Effect.runPromise(
  Effect.gen(function* driveInvoices() {
    const before = yield* listInvoiceStatus.handler(statusRequest);

    const coverage = yield* countInvoiceCoverage.handler(request);

    const places = yield* readArchivePlaces.handler(request);

    const sources = yield* readInvoiceSources.handler(request);

    const proposals = yield* matchInvoices.handler(request);

    const afterMatch = yield* readInvoiceDocument.handler({
      ...request,
      documentId: receipt.id,
    });

    const emitted = [
      observe({
        id: "invoices-capability-lists-status",
        value: statusText(before),
      }),
      observe({
        id: "invoices-capability-counts-coverage",
        value: coverage.months
          .map(
            (row) =>
              `${row.month}:${row.payments}:${row.invoiced}:${row.excepted}:${row.missing}`
          )
          .join(","),
      }),
      observe({
        id: "invoices-capability-reads-places",
        value: places.places
          .map(
            (place) =>
              `${place.provider}:${place.rootRef}:${place.blocklist.join(",")}`
          )
          .join(";"),
      }),
      observe({
        id: "invoices-capability-reads-sources",
        value: sources.sources
          .map((row) => `${row.pattern}:${Option.getOrNull(row.portalUrl)}`)
          .join(","),
      }),
      observe({
        id: "invoices-capability-proposes-match",
        value: `proposals=${proposals.proposals.length} document=${proposals.proposals[0]?.documentId === receipt.id} payment=${proposals.proposals[0]?.transactionId === design.id} stillUnattached=${Option.isNone(afterMatch.document.transactionId)}`,
      }),
    ];

    const place = yield* saveArchivePlace.handler({
      ...request,
      blocklist: [" *.tmp ", "private*"],
      provider: "local",
      rootRef: " demo-verify-archive ",
    });

    emitted.push(
      observe({
        id: "invoices-capability-saves-place",
        value: `sameId=${place.id === localPlace.id} root=${place.rootRef}`,
      })
    );

    const afterPlace = yield* readArchivePlaces.handler(request);

    emitted.push(
      observe({
        id: "invoices-place-reads-back",
        operation: "readArchivePlaces",
        value: placeRecords(afterPlace),
      })
    );

    const attached = yield* attachInvoice.handler({
      ...request,
      documentId: receipt.id,
      transactionId: design.id,
    });

    emitted.push(
      observe({
        id: "invoices-capability-attaches-document",
        value: `payment=${Option.getOrNull(attached.transactionId) === design.id} amount=${Option.getOrNull(attached.amount)?.currency}:${Option.getOrNull(attached.amount)?.minor}`,
      })
    );

    const afterAttach = yield* readInvoiceDocument.handler({
      ...request,
      documentId: receipt.id,
    });

    emitted.push(
      observe({
        id: "invoices-attach-reads-back",
        operation: "readInvoiceDocument",
        value: [documentRecord(afterAttach)],
      })
    );

    const reserved = yield* reserveInvoiceArchive.handler({
      ...request,
      documentId: receipt.id,
      fileId: "demo-file-2",
      placeId: place.id,
    });

    emitted.push(
      observe({
        id: "invoices-capability-reserves-archive",
        value: reserved.archive._tag,
      })
    );

    const afterReserve = yield* readInvoiceDocument.handler({
      ...request,
      documentId: receipt.id,
    });

    emitted.push(
      observe({
        id: "invoices-reserve-reads-back",
        operation: "readInvoiceDocument",
        value: [documentRecord(afterReserve)],
      })
    );

    const archived = yield* recordInvoiceArchive.handler({
      ...request,
      documentId: receipt.id,
      outcome: ArchiveOutcomeSchema.cases.Archived.make({}),
    });

    emitted.push(
      observe({
        id: "invoices-capability-records-archive",
        value: archived.archive._tag,
      })
    );

    const afterArchive = yield* readInvoiceDocument.handler({
      ...request,
      documentId: receipt.id,
    });

    emitted.push(
      observe({
        id: "invoices-archive-reads-back",
        operation: "readInvoiceDocument",
        value: [documentRecord(afterArchive)],
      })
    );

    const firstPage = yield* listArchivedDocuments.handler({
      ...request,
      cursor: Option.none(),
      limit: 1,
    });

    const nextPage = yield* listArchivedDocuments.handler({
      ...request,
      cursor: firstPage.next,
      limit: 1,
    });

    emitted.push(
      observe({
        id: "invoices-capability-pages-archive",
        value: `total=${firstPage.total} first=${firstPage.documents.map((row) => row.document.originalFilename).join(",")} second=${nextPage.documents.map((row) => row.document.originalFilename).join(",")} end=${Option.isNone(nextPage.next)}`,
      })
    );

    const exception = yield* recordInvoiceException.handler({
      ...request,
      reason: " Demo receipt requested. ",
      transactionId: coffee.id,
    });

    emitted.push(
      observe({
        id: "invoices-capability-records-exception",
        value: exception.reason,
      })
    );

    const afterException = yield* listInvoiceStatus.handler(statusRequest);

    emitted.push(
      observe({
        id: "invoices-exception-reads-back",
        operation: "listInvoiceStatus",
        value: statusRecords(afterException),
      })
    );

    const savedSource = yield* saveInvoiceSource.handler({
      ...request,
      loginHint: null,
      notes: "Demo updated portal.",
      pattern: "demo design tool",
      portalUrl: "https://portal.example.com/invoices",
      retrieval: {
        bookkeeper: false,
        email: false,
        portal: true,
        twoFactor: true,
      },
      vendorPayeeId: Option.getOrNull(design.payeeId),
    });

    emitted.push(
      observe({
        id: "invoices-capability-saves-source",
        value: `sameId=${savedSource.id === source.id} pattern=${savedSource.pattern}`,
      })
    );

    const afterSource = yield* readInvoiceSources.handler(request);

    emitted.push(
      observe({
        id: "invoices-source-reads-back",
        operation: "readInvoiceSources",
        value: sourceRecords(afterSource),
      })
    );

    const uploaded = yield* saveInvoiceFile.handler({
      ...request,
      ...file,
      transactionId: coffee.id,
    });

    const replayed = yield* saveInvoiceFile.handler({
      ...request,
      ...file,
      transactionId: coffee.id,
    });

    emitted.push(
      observe({
        id: "invoices-capability-saves-file-once",
        value: `sameId=${uploaded.id === replayed.id} payment=${Option.getOrNull(uploaded.transactionId) === coffee.id}`,
      })
    );

    const afterFile = yield* readInvoiceDocument.handler({
      ...request,
      documentId: uploaded.id,
    });

    emitted.push(
      observe({
        id: "invoices-file-reads-back",
        operation: "readInvoiceDocument",
        value: [documentRecord(afterFile)],
      })
    );

    const legacy = yield* registerLegacyInvoices.handler({
      ...request,
      files: [file, legacyFile],
    });

    const legacyReplay = yield* registerLegacyInvoices.handler({
      ...request,
      files: [file, legacyFile],
    });

    emitted.push(
      observe({
        id: "invoices-capability-registers-legacy-once",
        value: `first=${legacy.files.map((row) => row.outcome._tag).join(",")} replay=${legacyReplay.files.map((row) => row.outcome._tag).join(",")}`,
      })
    );

    const [, legacyRow] = legacy.files;

    const afterLegacy = yield* readInvoiceDocument.handler({
      ...request,
      documentId: legacyRow.document.id,
    });

    emitted.push(
      observe({
        id: "invoices-legacy-reads-back",
        operation: "readInvoiceDocument",
        value: [documentRecord(afterLegacy)],
      })
    );

    const removedSource = yield* deleteInvoiceSource.handler({
      ...request,
      sourceId: savedSource.id,
    });

    emitted.push(
      observe({
        id: "invoices-capability-deletes-source",
        value: `sameId=${removedSource.sourceId === savedSource.id}`,
      })
    );

    const afterDeleteSource = yield* readInvoiceSources.handler(request);

    emitted.push(
      observe({
        id: "invoices-source-delete-reads-back",
        operation: "readInvoiceSources",
        value: [
          {
            deletedSourceId: savedSource.id,
            id: "invoice-sources",
            profileId: demoProfileId,
            remainingCount: afterDeleteSource.sources.length,
          },
        ],
      })
    );

    const removed = yield* removeInvoiceDocument.handler({
      ...request,
      documentId: receipt.id,
    });

    emitted.push(
      observe({
        id: "invoices-capability-removes-document",
        value: `sameId=${removed.documentId === receipt.id}`,
      })
    );

    const afterRemove = yield* listInvoiceStatus.handler(statusRequest);

    emitted.push(
      observe({
        id: "invoices-remove-reads-back",
        operation: "listInvoiceStatus",
        value: statusRecords(afterRemove),
      })
    );

    return emitted;
  }).pipe(Effect.provide(world))
);

process.stdout.write(
  `${JSON.stringify({ observations, mutatingCalls: recorder.total() }, null, 2)}\n`
);
