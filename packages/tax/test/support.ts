import { CurrentPerson, PersonSchema } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { codecs, parse, TaxObligationStatusSchema } from "@pecunia/core/model";
import type { ProfileId, TaxObligation, TaxProfile } from "@pecunia/core/model";
import { Effect, Layer, Schema } from "effect";
import * as SecureRandom from "effect/crypto/SecureRandom";

import { demoProfileId, demoTaxProfile } from "../src/demo.js";
import { parseFreeAgentDues } from "../src/freeagent.js";
import { memoryTaxDueStoreLayer } from "../src/memory.js";
import { TaxDueService } from "../src/service.js";
import { TaxBooks } from "../src/tax-books.js";
import type { TaxBooksService } from "../src/tax-books.js";

export const otherProfileId: ProfileId = parse(
  codecs.profileId,
  "0192f0c1-0002-7363-8d10-2b3a5c4d6e7f"
);

export const otherTaxProfile: TaxProfile = parse(codecs.taxProfile, {
  id: "0192f0c1-0041-7a3e-9b26-4d5c6d7e8f90",
  jurisdiction: "GB",
  primary: true,
  profileId: otherProfileId,
  yearStart: { day: 6, month: 4 },
});

export const otherDue: TaxObligation = parse(codecs.taxObligation, {
  amount: { currency: "EUR", minor: 250_000 },
  dueOn: "2026-03-31",
  id: "0192f0c1-0042-7c1d-8e2f-3a4b5c6d7e8f",
  kind: "SelfAssessment",
  label: "Self Assessment",
  periodEndsOn: "2025-12-31",
  profileId: otherProfileId,
  status: TaxObligationStatusSchema.cases.Estimated.make({
    booksStatus: "unpaid",
  }),
  syncedAt: "2026-01-01T00:00:00.000Z",
  taxProfileId: otherTaxProfile.id,
});

export const owner = Schema.decodeSync(PersonSchema)({
  email: "tax-demo@example.com",
  memberships: [
    { profileId: demoProfileId, role: "owner" },
    { profileId: otherProfileId, role: "owner" },
  ],
  personId: "person-tax-demo",
});

export const viewer = Schema.decodeSync(PersonSchema)({
  email: "tax-viewer@example.com",
  memberships: [{ profileId: demoProfileId, role: "viewer" }],
  personId: "person-tax-viewer",
});

export const stranger = Schema.decodeSync(PersonSchema)({
  email: "tax-stranger@example.com",
  memberships: [{ profileId: otherProfileId, role: "owner" }],
  personId: "person-tax-stranger",
});

export const deterministicRandom =
  (): Layer.Layer<SecureRandom.SecureRandom> => {
    let counter = 0;

    return Layer.succeed(
      SecureRandom.SecureRandom,
      SecureRandom.make((size) => {
        counter += 1;

        const bytes = new Uint8Array(size);
        const stamp = counter.toString(16).padStart(8, "0");

        for (let index = 0; index < stamp.length; index += 1) {
          bytes[size - stamp.length + index] = stamp.codePointAt(index) ?? 0;
        }

        return bytes;
      })
    );
  };

export const layerFor = (
  person: Person,
  books: TaxBooksService
): Layer.Layer<TaxDueService | CurrentPerson> =>
  Layer.mergeAll(
    TaxDueService.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          memoryTaxDueStoreLayer({
            dues: [otherDue],
            taxProfiles: [demoTaxProfile, otherTaxProfile],
          }),
          Layer.succeed(TaxBooks, books)
        )
      )
    ),
    Layer.succeed(CurrentPerson, person)
  ).pipe(Layer.provide(deterministicRandom()));

export const scriptedBooks = (
  payload: Effect.Effect<unknown>
): TaxBooksService => ({
  booksTool: "freeagent",
  fetchDues: () =>
    payload.pipe(
      Effect.flatMap((value) => Effect.fromResult(parseFreeAgentDues(value)))
    ),
});
