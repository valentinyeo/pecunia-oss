import { expect, it } from "@effect/vitest";
import { ProfileIdSchema } from "@pecunia/access";
import { Effect, Schema } from "effect";

import {
  demoArchivePlaces,
  demoDocuments,
  demoPayments,
  demoProfileId,
} from "../src/demo.js";
import { memoryInvoiceStoreLayer } from "../src/memory.js";
import {
  ArchivePlaceIdSchema,
  DocumentIdSchema,
  TransactionIdSchema,
} from "../src/model.js";
import type { ArchivePlace, InvoiceDocument, Payment } from "../src/model.js";
import { InvoiceStore } from "../src/store.js";

const decode = Schema.decodeSync;

const documentId = (value: string) => decode(DocumentIdSchema)(value);

const transactionId = (value: string) => decode(TransactionIdSchema)(value);

const placeId = (value: string) => decode(ArchivePlaceIdSchema)(value);

const otherProfileId = decode(ProfileIdSchema)("profile-other-lists");

const firstOf = <A>(rows: readonly A[]): A => {
  const [first] = rows;

  if (first === undefined) {
    throw new Error("The demo book has no row to copy");
  }

  return first;
};

const otherDocument: InvoiceDocument = {
  ...firstOf(demoDocuments),
  id: documentId("document-other-lists"),
  profileId: otherProfileId,
};

const otherPayment: Payment = {
  ...firstOf(demoPayments),
  id: transactionId("payment-other-lists"),
  profileId: otherProfileId,
};

const otherPlace: ArchivePlace = {
  ...firstOf(demoArchivePlaces),
  id: placeId("place-other-lists"),
  profileId: otherProfileId,
};

const bothProfiles = memoryInvoiceStoreLayer({
  documents: [...demoDocuments, otherDocument],
  payments: [...demoPayments, otherPayment],
  places: [...demoArchivePlaces, otherPlace],
});

const idsOf = (rows: readonly { readonly id: string }[]) =>
  rows.map((row) => row.id);

it.effect(
  "lists only the acting profile's documents, payments and places",
  () =>
    Effect.gen(function* listInsideTheProfile() {
      const store = yield* InvoiceStore;

      expect(idsOf(yield* store.documents(demoProfileId))).toEqual(
        idsOf(demoDocuments)
      );

      expect(idsOf(yield* store.documents(otherProfileId))).toEqual([
        otherDocument.id,
      ]);

      expect(idsOf(yield* store.payments(demoProfileId))).toEqual(
        idsOf(demoPayments)
      );

      expect(idsOf(yield* store.payments(otherProfileId))).toEqual([
        otherPayment.id,
      ]);

      expect(idsOf(yield* store.places(demoProfileId))).toEqual(
        idsOf(demoArchivePlaces)
      );

      expect(idsOf(yield* store.places(otherProfileId))).toEqual([
        otherPlace.id,
      ]);
    }).pipe(Effect.provide(bothProfiles), Effect.orDie)
);
