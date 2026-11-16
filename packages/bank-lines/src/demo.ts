import { PersonSchema, ProfileIdSchema } from "@pecunia/access";
import { Schema } from "effect";

import type { MemoryCategory } from "./memory.js";
import {
  BankLineSchema,
  CategoryIdSchema,
  ReviewSchema,
  TimestampMillisSchema,
} from "./model.js";
import type { BankLine } from "./model.js";

const decode = Schema.decodeSync;

export const demoProfileId = decode(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

export const demoPerson = decode(PersonSchema)({
  email: "demo@example.com",
  memberships: [{ profileId: demoProfileId, role: "owner" }],
  personId: "person-demo",
});

const category = (id: string) => decode(CategoryIdSchema)(id);

export const demoCategories: readonly MemoryCategory[] = [
  {
    id: category("0192f0c1-000d-75e9-8fd7-fd7e43c901ee"),
    profileId: demoProfileId,
  },
  {
    id: category("0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba"),
    profileId: demoProfileId,
  },
  {
    id: category("0192f0c1-000f-755b-8ae4-ae47d20b52cf"),
    profileId: demoProfileId,
  },
  {
    id: category("0192f0c1-0010-744d-827c-27cf38c20ebb"),
    profileId: demoProfileId,
  },
  {
    id: category("0192f0c1-0011-79f9-8c9a-c9af5a7eff0d"),
    profileId: demoProfileId,
  },
  {
    id: category("0192f0c1-0013-703c-80e5-0e5bbe77367b"),
    profileId: demoProfileId,
  },
];

const reviewed = (occurredAt: number, days: number) =>
  ReviewSchema.cases.Reviewed.make({
    at: Schema.decodeSync(TimestampMillisSchema)(
      occurredAt + days * 86_400_000
    ),
  });

export const demoBankLines: readonly BankLine[] = decode(
  Schema.Array(BankLineSchema)
)([
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 480_000 },
    baseAmount: { currency: "EUR", minor: 480_000 },
    category: "0192f0c1-0013-703c-80e5-0e5bbe77367b",
    direction: "in",
    id: "0192f0c1-0027-7c11-8261-2619d29e6868",
    note: "",
    occurredAt: 1_736_154_000_000,
    profileId: demoProfileId,
    raw: {
      description: "Invoice payment",
      merchant: "Example Ltd",
      reference: "",
    },
    review: reviewed(1_736_154_000_000, 1),
    status: "posted",
    valueDate: "2025-01-06",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 299_000 },
    baseAmount: { currency: "EUR", minor: 299_000 },
    category: "0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba",
    direction: "out",
    id: "0192f0c1-0028-7018-8357-3578945c907b",
    note: "Renewed after the demo renewal reminder",
    occurredAt: 1_738_573_200_000,
    profileId: demoProfileId,
    raw: {
      description: "Cloud hosting",
      merchant: "Demo Cloud Hosting",
      reference: "",
    },
    review: reviewed(1_738_573_200_000, 2),
    status: "posted",
    valueDate: "2025-02-03",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "USD", minor: 2999 },
    baseAmount: { currency: "EUR", minor: 2765 },
    category: "0192f0c1-000f-755b-8ae4-ae47d20b52cf",
    direction: "out",
    id: "0192f0c1-0029-768c-8adb-adbefc188d19",
    note: "",
    occurredAt: 1_741_683_600_000,
    profileId: demoProfileId,
    raw: {
      description: "Design subscription",
      merchant: "Demo Design Tool",
      reference: "",
    },
    review: reviewed(1_741_683_600_000, 3),
    status: "posted",
    valueDate: "2025-03-11",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 4250 },
    baseAmount: { currency: "EUR", minor: 4250 },
    category: "0192f0c1-0011-79f9-8c9a-c9af5a7eff0d",
    direction: "out",
    id: "0192f0c1-002a-7549-8811-8111b948c159",
    note: "Client lunch",
    occurredAt: 1_743_584_400_000,
    profileId: demoProfileId,
    raw: {
      description: "Client lunch",
      merchant: "Demo Coffee",
      reference: "",
    },
    review: reviewed(1_743_584_400_000, 1),
    status: "posted",
    valueDate: "2025-04-02",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "GBP", minor: 12_000 },
    baseAmount: { currency: "EUR", minor: 14_040 },
    category: "0192f0c1-0010-744d-827c-27cf38c20ebb",
    direction: "out",
    id: "0192f0c1-002b-79a6-8b1a-b1ab7e790030",
    note: "",
    occurredAt: 1_746_781_200_000,
    profileId: demoProfileId,
    raw: {
      description: "Demo Rail ticket",
      merchant: "Demo Rail",
      reference: "",
    },
    review: reviewed(1_746_781_200_000, 4),
    status: "posted",
    valueDate: "2025-05-09",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 100_000 },
    baseAmount: { currency: "EUR", minor: 100_000 },
    category: null,
    direction: "neutral",
    id: "0192f0c1-002c-7e06-8db2-db29cc906e10",
    note: "",
    occurredAt: 1_749_978_000_000,
    profileId: demoProfileId,
    raw: {
      description: "Moved to Demo Savings",
      merchant: "",
      reference: "",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2025-06-15",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 60_000 },
    baseAmount: { currency: "EUR", minor: 60_000 },
    category: null,
    direction: "neutral",
    id: "0192f0c1-002d-72a8-8fd3-fd3ae1482dc5",
    note: "",
    occurredAt: 1_751_360_400_000,
    profileId: demoProfileId,
    raw: {
      description: "Transfer to Demo Person",
      merchant: "",
      reference: "",
    },
    review: reviewed(1_751_360_400_000, 2),
    status: "posted",
    valueDate: "2025-07-01",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 1500 },
    baseAmount: { currency: "EUR", minor: 1500 },
    category: null,
    direction: "out",
    id: "0192f0c1-002e-70b6-8abf-abfcf0a3117a",
    note: "",
    occurredAt: 1_754_298_000_000,
    profileId: demoProfileId,
    raw: {
      description: "Internal demo movement",
      merchant: "",
      reference: "0000123",
    },
    review: reviewed(1_754_298_000_000, 1),
    status: "posted",
    valueDate: "2025-08-04",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 250_000 },
    baseAmount: { currency: "EUR", minor: 250_000 },
    category: null,
    direction: "out",
    id: "0192f0c1-002f-7574-8f47-f477afee2375",
    note: "",
    occurredAt: 1_756_803_600_000,
    profileId: demoProfileId,
    raw: {
      description: "Demo VAT payment",
      merchant: "Demo Tax Office",
      reference: "TAX-VAT-2025",
    },
    review: reviewed(1_756_803_600_000, 5),
    status: "posted",
    valueDate: "2025-09-02",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 3500 },
    baseAmount: { currency: "EUR", minor: 3500 },
    category: null,
    direction: "in",
    id: "0192f0c1-0030-7085-8d2f-d2f021323f32",
    note: "",
    occurredAt: 1_759_741_200_000,
    profileId: demoProfileId,
    raw: {
      description: "Refund from Demo Design Tool",
      merchant: "Demo Design Tool",
      reference: "",
    },
    review: reviewed(1_759_741_200_000, 3),
    status: "posted",
    valueDate: "2025-10-06",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 8900 },
    baseAmount: { currency: "EUR", minor: 8900 },
    category: "0192f0c1-0011-79f9-8c9a-c9af5a7eff0d",
    direction: "out",
    id: "0192f0c1-0031-7ab6-8c3b-c3bb339364f8",
    note: "Team breakfast",
    occurredAt: 1_762_160_400_000,
    profileId: demoProfileId,
    raw: {
      description: "Team breakfast",
      merchant: "Demo Coffee",
      reference: "",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2025-11-03",
  },
  {
    accountId: "0192f0c1-0006-7b7b-8ffd-ffde623dd8df",
    amount: { currency: "EUR", minor: 5200 },
    baseAmount: { currency: "EUR", minor: 5200 },
    category: "0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba",
    direction: "out",
    id: "0192f0c1-0032-754e-8db8-db8922229d3c",
    note: "",
    occurredAt: 1_765_184_400_000,
    profileId: demoProfileId,
    raw: {
      description: "Cloud hosting",
      merchant: "Demo Cloud Hosting",
      reference: "",
    },
    review: reviewed(1_765_184_400_000, 1),
    status: "pending",
    valueDate: "2025-12-08",
  },
]);
