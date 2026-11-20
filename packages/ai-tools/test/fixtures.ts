import { PersonSchema, ProfileIdSchema } from "@pecunia/access";
import type { Person, ProfileId } from "@pecunia/access";
import {
  BankLineSchema,
  BankLineStore,
  ReviewSchema,
} from "@pecunia/bank-lines";
import type { BankLine } from "@pecunia/bank-lines";
import { CategorySchema } from "@pecunia/categorize";
import type { Category } from "@pecunia/categorize";
import { Effect, Layer, Schema } from "effect";

import { AuditLog } from "../src/audit.js";
import { ToolCaller } from "../src/caller.js";
import { CategoryStore } from "../src/category-store.js";
import { memoryToolsLayer } from "../src/memory.js";
import type { MemoryToolsSeed } from "../src/memory.js";
import { ReportStore, ReportSummarySchema } from "../src/report-store.js";
import { SuggestionStore } from "../src/suggestion-store.js";

export const profileA = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-1001-7a2b-8c4d-5e6f70819201"
);

export const profileB = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-1001-7a2b-8c4d-5e6f70819202"
);

export const categoryA = {
  groceries: "0192f0c1-2001-7a2b-8c4d-5e6f70819211",
  travel: "0192f0c1-2002-7a2b-8c4d-5e6f70819212",
} as const;

export const categoryB = {
  home: "0192f0c1-2003-7a2b-8c4d-5e6f70819221",
  salary: "0192f0c1-2004-7a2b-8c4d-5e6f70819222",
} as const;

export const lineA = {
  invoice: "0192f0c1-3001-7a2b-8c4d-5e6f70819231",
  rent: "0192f0c1-3002-7a2b-8c4d-5e6f70819232",
  train: "0192f0c1-3003-7a2b-8c4d-5e6f70819233",
} as const;

export const lineB = {
  sofa: "0192f0c1-3004-7a2b-8c4d-5e6f70819241",
  wages: "0192f0c1-3005-7a2b-8c4d-5e6f70819242",
} as const;

export const reportA = {
  monthly: "0192f0c1-4001-7a2b-8c4d-5e6f70819251",
  exploration: "0192f0c1-4002-7a2b-8c4d-5e6f70819252",
} as const;

export const reportB = {
  quarterly: "0192f0c1-4003-7a2b-8c4d-5e6f70819261",
} as const;

const decode = Schema.decodeSync;

export const fixtureCategories: readonly Category[] = decode(
  Schema.Array(CategorySchema)
)([
  {
    archived: false,
    color: "amber",
    id: categoryA.groceries,
    name: "Groceries",
    parentId: null,
    profileId: profileA,
    spendingType: "personal",
  },
  {
    archived: false,
    color: "teal",
    id: categoryA.travel,
    name: "Travel",
    parentId: null,
    profileId: profileA,
    spendingType: "business",
  },
  {
    archived: true,
    color: "slate",
    id: categoryB.home,
    name: "Home",
    parentId: null,
    profileId: profileB,
    spendingType: "personal",
  },
  {
    archived: false,
    color: "green",
    id: categoryB.salary,
    name: "Salary",
    parentId: null,
    profileId: profileB,
    spendingType: "personal",
  },
]);

const tenthOfFebruary = 1_707_566_400_000;

const twentiethOfFebruary = 1_708_430_400_000;

const fifthOfMarch = 1_709_596_800_000;

export const fixtureLines: readonly BankLine[] = decode(
  Schema.Array(BankLineSchema)
)([
  {
    accountId: "0192f0c1-5001-7a2b-8c4d-5e6f70819271",
    amount: { currency: "EUR", minor: 480_000 },
    baseAmount: { currency: "EUR", minor: 480_000 },
    category: categoryA.travel,
    direction: "in",
    id: lineA.invoice,
    note: "Invoice paid by Example Ltd",
    occurredAt: tenthOfFebruary,
    profileId: profileA,
    raw: {
      description: "Invoice payment",
      merchant: "Example Ltd",
      reference: "INV-0001",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2024-02-10",
  },
  {
    accountId: "0192f0c1-5001-7a2b-8c4d-5e6f70819271",
    amount: { currency: "EUR", minor: 12_345 },
    baseAmount: { currency: "EUR", minor: 12_345 },
    category: null,
    direction: "out",
    id: lineA.rent,
    note: "",
    occurredAt: twentiethOfFebruary,
    profileId: profileA,
    raw: {
      description: "Monthly rent",
      merchant: "Demo Lettings",
      reference: "",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2024-02-20",
  },
  {
    accountId: "0192f0c1-5001-7a2b-8c4d-5e6f70819271",
    amount: { currency: "GBP", minor: 899 },
    baseAmount: { currency: "GBP", minor: 899 },
    category: null,
    direction: "out",
    id: lineA.train,
    note: "",
    occurredAt: fifthOfMarch,
    profileId: profileA,
    raw: {
      description: "Train ticket",
      merchant: "Demo Rail",
      reference: "",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2024-03-05",
  },
  {
    accountId: "0192f0c1-5002-7a2b-8c4d-5e6f70819272",
    amount: { currency: "EUR", minor: 95_000 },
    baseAmount: { currency: "EUR", minor: 95_000 },
    category: categoryB.home,
    direction: "out",
    id: lineB.sofa,
    note: "",
    occurredAt: tenthOfFebruary,
    profileId: profileB,
    raw: {
      description: "Sofa",
      merchant: "Demo Furniture",
      reference: "",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2024-02-10",
  },
  {
    accountId: "0192f0c1-5002-7a2b-8c4d-5e6f70819272",
    amount: { currency: "EUR", minor: 250_000 },
    baseAmount: { currency: "EUR", minor: 250_000 },
    category: categoryB.salary,
    direction: "in",
    id: lineB.wages,
    note: "",
    occurredAt: twentiethOfFebruary,
    profileId: profileB,
    raw: {
      description: "Wages",
      merchant: "Demo Bank",
      reference: "",
    },
    review: ReviewSchema.cases.Awaiting.make({}),
    status: "posted",
    valueDate: "2024-02-20",
  },
]);

export const fixtureReports = decode(Schema.Array(ReportSummarySchema))([
  {
    id: reportA.monthly,
    kind: "report",
    profileId: profileA,
    slug: "monthly-spend",
    title: "Monthly spend",
    updatedAt: 1_708_430_400_000,
  },
  {
    id: reportA.exploration,
    kind: "exploration",
    profileId: profileA,
    slug: "travel-cutback",
    title: "Travel cutback",
    updatedAt: 1_709_596_800_000,
  },
  {
    id: reportB.quarterly,
    kind: "report",
    profileId: profileB,
    slug: "quarterly-view",
    title: "Quarterly view",
    updatedAt: 1_709_596_800_000,
  },
]);

export const fixtureSeed: MemoryToolsSeed = {
  categories: fixtureCategories,
  lines: fixtureLines,
  reports: fixtureReports,
  suggestions: [],
};

export type Persona = "ownerA" | "ownerB" | "stranger" | "viewerA";

const person = (
  email: string,
  memberships: readonly {
    readonly profileId: ProfileId;
    readonly role: "owner" | "viewer";
  }[]
): Person => decode(PersonSchema)({ email, memberships, personId: email });

export const people: Record<Persona, Person> = {
  ownerA: person("owner-a@example.com", [
    { profileId: profileA, role: "owner" },
  ]),
  ownerB: person("owner-b@example.com", [
    { profileId: profileB, role: "owner" },
  ]),
  stranger: person("stranger@example.com", []),
  viewerA: person("viewer-a@example.com", [
    { profileId: profileA, role: "viewer" },
  ]),
};

export const personOf = (persona: Persona): Person => people[persona];

export const callerLayer = (persona: Persona, profileId: ProfileId) =>
  Layer.succeed(ToolCaller, { person: personOf(persona), profileId });

export const worldLayer = (persona: Persona, profileId: ProfileId) =>
  Layer.merge(memoryToolsLayer(fixtureSeed), callerLayer(persona, profileId));

export const worldSnapshot = Effect.gen(function* snapshotWorld() {
  const lines = yield* BankLineStore;
  const categories = yield* CategoryStore;
  const reports = yield* ReportStore;
  const suggestions = yield* SuggestionStore;

  const book = [];

  for (const profileId of [profileA, profileB]) {
    book.push({
      categories: yield* categories.list(profileId),
      lines: yield* lines.lines(profileId),
      reports: yield* reports.list(profileId),
      suggestions: yield* suggestions.list(profileId),
    });
  }

  return JSON.stringify(book);
});

export const auditEntries = Effect.gen(function* readAudit() {
  const audit = yield* AuditLog;

  return yield* audit.entries();
});

export const profileState = (profileId: ProfileId) =>
  Effect.gen(function* snapshotProfile() {
    const lines = yield* BankLineStore;
    const categories = yield* CategoryStore;
    const reports = yield* ReportStore;
    const suggestions = yield* SuggestionStore;

    return JSON.stringify({
      categories: yield* categories.list(profileId),
      lines: yield* lines.lines(profileId),
      reports: yield* reports.list(profileId),
      suggestions: yield* suggestions.list(profileId),
    });
  });

export const linesState = (profileId: ProfileId) =>
  Effect.gen(function* snapshotLines() {
    const lines = yield* BankLineStore;
    const stored = yield* lines.lines(profileId);

    return JSON.stringify(
      stored.map((line) => ({
        category: line.category,
        id: line.id,
        note: line.note,
      }))
    );
  });

export const profileIds = [profileA, profileB] as const;

export const linesOfProfile = (profileId: ProfileId): readonly string[] => {
  if (profileId === profileA) {
    return [lineA.invoice, lineA.rent, lineA.train];
  }

  return profileId === profileB ? [lineB.sofa, lineB.wages] : [];
};

export const categoriesOfProfile = (
  profileId: ProfileId
): readonly string[] => {
  if (profileId === profileA) {
    return [categoryA.groceries, categoryA.travel];
  }

  return profileId === profileB ? [categoryB.home, categoryB.salary] : [];
};

export const reportsOfProfile = (profileId: ProfileId): readonly string[] => {
  if (profileId === profileA) {
    return [reportA.monthly, reportA.exploration];
  }

  return profileId === profileB ? [reportB.quarterly] : [];
};

export const identifiersOf = (profileId: ProfileId): readonly string[] => [
  String(profileId),
  ...linesOfProfile(profileId),
  ...categoriesOfProfile(profileId),
  ...reportsOfProfile(profileId),
];

export const otherProfile = (profileId: ProfileId): ProfileId =>
  profileId === profileA ? profileB : profileA;
