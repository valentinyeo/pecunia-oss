import { PersonSchema } from "@pecunia/access";
import { codecs, parse } from "@pecunia/core/model";
import type { ProfileId, TaxProfile } from "@pecunia/core/model";
import { Layer, Result, Schema } from "effect";
import type * as SecureRandom from "effect/crypto/SecureRandom";

import { freeAgentTaxBooks, parseFreeAgentDues } from "./freeagent.js";
import { seededMemoryTaxDueStoreLayer } from "./memory.js";
import { TaxDueService } from "./service.js";
import { TaxBooks } from "./tax-books.js";

export const demoProfileId: ProfileId = parse(
  codecs.profileId,
  "0192f0c1-0001-702d-8484-48490b729601"
);

export const demoPerson = Schema.decodeSync(PersonSchema)({
  email: "demo@example.com",
  memberships: [{ profileId: demoProfileId, role: "owner" }],
  personId: "person-demo",
});

export const demoTaxProfile: TaxProfile = parse(codecs.taxProfile, {
  id: "0192f0c1-0040-75c4-8a37-7c0d1c2b6f10",
  jurisdiction: "GB",
  primary: true,
  profileId: demoProfileId,
  yearStart: { day: 6, month: 4 },
});

export const demoFreeAgentDues = {
  self_assessment_payments: [
    {
      amount_due: "1240.50",
      currency: "GBP",
      due_on: "2026-01-31",
      period_ends_on: "2025-04-05",
      status: "unpaid",
    },
    {
      amount_due: "980.00",
      currency: "GBP",
      due_on: "2026-07-31",
      period_ends_on: "2026-04-05",
      status: "unpaid",
    },
  ],
} as const;

const demoDeclarations = Result.getOrThrow(
  parseFreeAgentDues(demoFreeAgentDues)
);

export const demoTaxDueLayer: Layer.Layer<
  TaxDueService,
  never,
  SecureRandom.SecureRandom
> = TaxDueService.layer.pipe(
  Layer.provide(
    Layer.mergeAll(
      seededMemoryTaxDueStoreLayer({
        declarations: demoDeclarations,
        owner: { profileId: demoProfileId, taxProfileId: demoTaxProfile.id },
        seed: { dues: [], taxProfiles: [demoTaxProfile] },
      }),
      Layer.succeed(TaxBooks, freeAgentTaxBooks(demoFreeAgentDues))
    )
  )
);
