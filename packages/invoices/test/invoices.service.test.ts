import { expect, it } from "@effect/vitest";
import { CurrentPerson, PersonSchema, ProfileIdSchema } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { Effect, Layer, Option, Predicate, Schema } from "effect";
import { TestClock } from "effect/testing";

import {
  attachInvoice,
  matchInvoices,
  readArchivePlaces,
  recordInvoiceArchive,
  reserveInvoiceArchive,
  saveArchivePlace,
} from "../src/capabilities.js";
import {
  demoArchivePlaces,
  demoDocuments,
  demoInvoiceSeed,
  demoPayments,
  demoPerson,
  demoProfileId,
} from "../src/demo.js";
import type { InvoiceSeed } from "../src/memory.js";
import { memoryInvoiceStoreLayer } from "../src/memory.js";
import {
  ArchiveOutcomeSchema,
  ArchivePlaceIdSchema,
  DocumentIdSchema,
  TransactionIdSchema,
} from "../src/model.js";
import type { ArchivePlace, InvoiceDocument, Payment } from "../src/model.js";
import { InvoiceService } from "../src/service.js";

const decode = Schema.decodeSync;

const documentId = (value: string) => decode(DocumentIdSchema)(value);

const transactionId = (value: string) => decode(TransactionIdSchema)(value);

const placeId = (value: string) => decode(ArchivePlaceIdSchema)(value);

const cloudInvoice = documentId("0192f0c1-0037-7a04-8ca7-ca71e8a2c121");

const designReceipt = documentId("0192f0c1-0038-7d36-85ce-5ceb83cb9775");

const examplePayment = transactionId("0192f0c1-0027-7c11-8261-2619d29e6868");

const cloudPayment = transactionId("0192f0c1-0028-7018-8357-3578945c907b");

const designPayment = transactionId("0192f0c1-0029-768c-8adb-adbefc188d19");

const localPlace = placeId("0192f0c1-0036-72cc-8abe-abebbea44bc0");

const layerFor = (person: Person, seed: InvoiceSeed = demoInvoiceSeed) =>
  Layer.mergeAll(
    InvoiceService.layer.pipe(Layer.provide(memoryInvoiceStoreLayer(seed))),
    Layer.succeed(CurrentPerson, person)
  );

const asOwner = layerFor(demoPerson);

const viewerPerson = decode(PersonSchema)({
  email: "finance@example.com",
  memberships: [{ profileId: demoProfileId, role: "viewer" }],
  personId: "person-viewer",
});

const strangerPerson = decode(PersonSchema)({
  email: "stranger@example.com",
  memberships: [
    {
      profileId: decode(ProfileIdSchema)("profile-stranger"),
      role: "owner",
    },
  ],
  personId: "person-stranger",
});

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
  "attaches the demo receipt to the demo payment and archives it in the user's place",
  () =>
    Effect.gen(function* attachAndArchiveTheDemoInvoice() {
      yield* TestClock.setTime(1_762_160_400_000);

      const places = yield* readArchivePlaces.handler({
        profileId: demoProfileId,
      });

      const local = placeNamed(places.places, localPlace);

      expect(local.rootRef).toBe("demo-archive");
      expect(local.blocklist).toEqual(["*.tmp"]);
      expect(local.provider).toBe("local");

      const before = yield* matchInvoices.handler({ profileId: demoProfileId });

      expect(before.proposals).toEqual([
        {
          daysApart: 0,
          documentId: designReceipt,
          payeeId: "0192f0c1-000b-7839-88f7-8f744744f3e0",
          transactionId: designPayment,
        },
      ]);

      const attached = yield* attachInvoice.handler({
        documentId: designReceipt,
        profileId: demoProfileId,
        transactionId: designPayment,
      });

      expect(Option.getOrUndefined(attached.transactionId)).toBe(designPayment);
      expect(Option.getOrUndefined(attached.amount)).toEqual({
        currency: "EUR",
        minor: 2765,
      });
      expect(attached.id).toBe(designReceipt);

      const after = yield* matchInvoices.handler({ profileId: demoProfileId });

      expect(after.proposals).toEqual([]);

      const reserved = yield* reserveInvoiceArchive.handler({
        documentId: designReceipt,
        fileId: "demo-file-2",
        placeId: localPlace,
        profileId: demoProfileId,
      });

      expect(Predicate.isTagged(reserved.archive, "Reserved")).toBe(true);

      if (Predicate.isTagged(reserved.archive, "Reserved")) {
        expect(reserved.archive.fileId).toBe("demo-file-2");
        expect(reserved.archive.placeId).toBe(localPlace);
      }

      const archived = yield* recordInvoiceArchive.handler({
        documentId: designReceipt,
        outcome: ArchiveOutcomeSchema.cases.Archived.make({}),
        profileId: demoProfileId,
      });

      expect(Predicate.isTagged(archived.archive, "Archived")).toBe(true);

      if (Predicate.isTagged(archived.archive, "Archived")) {
        expect(archived.archive.fileId).toBe("demo-file-2");
        expect(archived.archive.placeId).toBe(localPlace);
        expect(archived.archive.archivedAt).toBe(1_762_160_400_000);
      }

      expect(Option.getOrUndefined(archived.transactionId)).toBe(designPayment);
    }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("shows the demo payment that already has its archived invoice", () =>
  Effect.gen(function* readTheArchivedDemoInvoice() {
    const documents = demoDocuments;

    const cloud = documentNamed(documents, cloudInvoice);

    expect(Option.getOrUndefined(cloud.transactionId)).toBe(cloudPayment);
    expect(Predicate.isTagged(cloud.archive, "Archived")).toBe(true);

    if (Predicate.isTagged(cloud.archive, "Archived")) {
      expect(cloud.archive.archivedAt).toBe(1_738_659_600_000);
      expect(cloud.archive.fileId).toBe("demo-file-1");
      expect(cloud.archive.placeId).toBe(localPlace);
    }

    const matched = yield* matchInvoices.handler({
      profileId: demoProfileId,
    });

    expect(
      matched.proposals.some((proposal) => proposal.documentId === cloudInvoice)
    ).toBe(false);

    expect(
      matched.proposals.some(
        (proposal) => proposal.transactionId === examplePayment
      )
    ).toBe(false);
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect(
  "refuses an unknown invoice, payment, place and archive step by name",
  () =>
    Effect.gen(function* refuseUnknownThings() {
      const invoice = yield* Effect.flip(
        attachInvoice.handler({
          documentId: documentId("document-missing"),
          profileId: demoProfileId,
          transactionId: cloudPayment,
        })
      );

      expect(invoice._tag).toBe("UnknownInvoice");

      const payment = yield* Effect.flip(
        attachInvoice.handler({
          documentId: designReceipt,
          profileId: demoProfileId,
          transactionId: transactionId("payment-missing"),
        })
      );

      expect(payment._tag).toBe("UnknownPayment");

      const place = yield* Effect.flip(
        reserveInvoiceArchive.handler({
          documentId: designReceipt,
          fileId: "demo-file-missing",
          placeId: placeId("place-missing"),
          profileId: demoProfileId,
        })
      );

      expect(place._tag).toBe("UnknownArchivePlace");

      const early = yield* Effect.flip(
        recordInvoiceArchive.handler({
          documentId: designReceipt,
          outcome: ArchiveOutcomeSchema.cases.Archived.make({}),
          profileId: demoProfileId,
        })
      );

      expect(early._tag).toBe("ArchiveStateRefused");

      if (Predicate.isTagged(early, "ArchiveStateRefused")) {
        expect(early.from).toBe("Unarchived");
        expect(early.to).toBe("Archived");
      }
    }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("never overwrites an invoice attached to another payment", () =>
  Effect.gen(function* guardTheAttachment() {
    const first = yield* attachInvoice.handler({
      documentId: designReceipt,
      profileId: demoProfileId,
      transactionId: designPayment,
    });

    const again = yield* attachInvoice.handler({
      documentId: designReceipt,
      profileId: demoProfileId,
      transactionId: designPayment,
    });

    expect(again).toEqual(first);

    const conflict = yield* Effect.flip(
      attachInvoice.handler({
        documentId: designReceipt,
        profileId: demoProfileId,
        transactionId: cloudPayment,
      })
    );

    expect(conflict._tag).toBe("InvoiceAlreadyAttached");

    if (Predicate.isTagged(conflict, "InvoiceAlreadyAttached")) {
      expect(conflict.attachedTo).toBe(designPayment);
      expect(conflict.transactionId).toBe(cloudPayment);
    }
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect(
  "reserves once, keeps the first archive instant, and clears a failure",
  () =>
    Effect.gen(function* walkTheArchiveStates() {
      const reserved = yield* reserveInvoiceArchive.handler({
        documentId: designReceipt,
        fileId: "demo-file-3",
        placeId: localPlace,
        profileId: demoProfileId,
      });

      const repeated = yield* reserveInvoiceArchive.handler({
        documentId: designReceipt,
        fileId: "demo-file-3",
        placeId: localPlace,
        profileId: demoProfileId,
      });

      expect(repeated.archive).toEqual(reserved.archive);

      const otherFile = yield* Effect.flip(
        reserveInvoiceArchive.handler({
          documentId: designReceipt,
          fileId: "demo-file-4",
          placeId: localPlace,
          profileId: demoProfileId,
        })
      );

      expect(otherFile._tag).toBe("ArchiveStateRefused");

      const failed = yield* recordInvoiceArchive.handler({
        documentId: designReceipt,
        outcome: ArchiveOutcomeSchema.cases.Failed.make({
          reason: "Demo drive refused the upload.",
        }),
        profileId: demoProfileId,
      });

      expect(Predicate.isTagged(failed.archive, "Failed")).toBe(true);

      if (Predicate.isTagged(failed.archive, "Failed")) {
        expect(failed.archive.reason).toBe("Demo drive refused the upload.");
      }

      const retried = yield* reserveInvoiceArchive.handler({
        documentId: designReceipt,
        fileId: "demo-file-5",
        placeId: localPlace,
        profileId: demoProfileId,
      });

      expect(Predicate.isTagged(retried.archive, "Reserved")).toBe(true);

      if (Predicate.isTagged(retried.archive, "Reserved")) {
        expect(retried.archive.fileId).toBe("demo-file-5");
        expect(retried.archive.placeId).toBe(localPlace);
      }

      const archived = yield* recordInvoiceArchive.handler({
        documentId: designReceipt,
        outcome: ArchiveOutcomeSchema.cases.Archived.make({}),
        profileId: demoProfileId,
      });

      const archivedAgain = yield* recordInvoiceArchive.handler({
        documentId: designReceipt,
        outcome: ArchiveOutcomeSchema.cases.Archived.make({}),
        profileId: demoProfileId,
      });

      expect(archivedAgain.archive).toEqual(archived.archive);
    }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("stores the archive place as a user setting, one per provider", () =>
  Effect.gen(function* saveTheArchivePlace() {
    const saved = yield* saveArchivePlace.handler({
      blocklist: [" drafts ", "exports"],
      profileId: demoProfileId,
      provider: "local",
      rootRef: " user/archive ",
    });

    expect(saved.id).toBe(localPlace);
    expect(saved.rootRef).toBe("user/archive");
    expect(saved.blocklist).toEqual(["drafts", "exports"]);
    expect(saved.profileId).toBe(demoProfileId);

    const places = yield* readArchivePlaces.handler({
      profileId: demoProfileId,
    });

    expect(places.places).toHaveLength(1);
    expect(placeNamed(places.places, localPlace).rootRef).toBe("user/archive");

    const added = yield* saveArchivePlace.handler({
      blocklist: [],
      profileId: demoProfileId,
      provider: "none",
      rootRef: "no-archive",
    });

    const all = yield* readArchivePlaces.handler({ profileId: demoProfileId });

    expect(all.places).toHaveLength(2);
    expect(placeNamed(all.places, added.id).provider).toBe("none");
  }).pipe(Effect.provide(asOwner), Effect.orDie)
);

it.effect("stops reserving into a place that stores nothing", () => {
  const nonePlace: ArchivePlace = {
    blocklist: [],
    id: placeId("place-none-demo"),
    profileId: demoProfileId,
    provider: "none",
    rootRef: "no-archive",
  };

  const layer = layerFor(demoPerson, {
    ...demoInvoiceSeed,
    places: [...demoArchivePlaces, nonePlace],
  });

  return Effect.gen(function* refuseTheNonePlace() {
    const refused = yield* Effect.flip(
      reserveInvoiceArchive.handler({
        documentId: designReceipt,
        fileId: "demo-file-none",
        placeId: nonePlace.id,
        profileId: demoProfileId,
      })
    );

    expect(refused._tag).toBe("ArchivePlaceUnavailable");
  }).pipe(Effect.provide(layer), Effect.orDie);
});

it.effect("lets a viewer read and stops the same viewer from writing", () => {
  const viewer = layerFor(viewerPerson);

  return Effect.gen(function* checkViewerAccess() {
    const places = yield* readArchivePlaces.handler({
      profileId: demoProfileId,
    });

    expect(places.places).toHaveLength(1);

    const matched = yield* matchInvoices.handler({ profileId: demoProfileId });

    expect(matched.proposals).toHaveLength(1);

    const write = yield* Effect.flip(
      attachInvoice.handler({
        documentId: designReceipt,
        profileId: demoProfileId,
        transactionId: designPayment,
      })
    );

    expect(write._tag).toBe("Forbidden");
  }).pipe(Effect.provide(viewer), Effect.orDie);
});

it.effect("stops a person with no membership from reading invoices", () => {
  const stranger = layerFor(strangerPerson);

  return Effect.gen(function* checkStrangerAccess() {
    const refused = yield* Effect.flip(
      matchInvoices.handler({ profileId: demoProfileId })
    );

    expect(refused._tag).toBe("Forbidden");
  }).pipe(Effect.provide(stranger), Effect.orDie);
});

it.effect("keeps every invoice read inside the acting profile", () => {
  const otherProfileId = decode(ProfileIdSchema)("profile-other-invoices");

  const bothPerson = decode(PersonSchema)({
    email: "two-profiles@example.com",
    memberships: [
      { profileId: demoProfileId, role: "owner" },
      { profileId: otherProfileId, role: "owner" },
    ],
    personId: "person-two-profiles",
  });

  const foreignDocument: InvoiceDocument = {
    ...documentNamed(demoDocuments, designReceipt),
    id: documentId("document-foreign"),
    profileId: otherProfileId,
  };

  const foreignPayment: Payment = {
    ...paymentNamed(demoPayments, designPayment),
    id: transactionId("payment-foreign"),
    profileId: otherProfileId,
  };

  const layer = layerFor(bothPerson, {
    documents: [foreignDocument],
    payments: [foreignPayment],
    places: [],
  });

  return Effect.gen(function* keepProfileBoundary() {
    const hidden = yield* Effect.flip(
      attachInvoice.handler({
        documentId: foreignDocument.id,
        profileId: demoProfileId,
        transactionId: foreignPayment.id,
      })
    );

    expect(hidden._tag).toBe("UnknownInvoice");

    const attached = yield* attachInvoice.handler({
      documentId: foreignDocument.id,
      profileId: otherProfileId,
      transactionId: foreignPayment.id,
    });

    expect(Option.getOrUndefined(attached.transactionId)).toBe(
      foreignPayment.id
    );
  }).pipe(Effect.provide(layer), Effect.orDie);
});
