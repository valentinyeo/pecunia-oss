import {
  AliasIdSchema,
  CategoryIdSchema,
  DisplayNameSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  RuleIdSchema,
  normalizeName,
} from "@pecunia/categorize";
import type {
  CategoryId,
  MerchantAlias,
  Payee,
  PayeeId,
  PayeeKind,
  RuleDirection,
} from "@pecunia/categorize";
import { Option, Schema } from "effect";

import { minorUnits } from "../money.js";
import type { Minor } from "../money.js";
import { PaymentIdSchema, TimestampMillisSchema, uuidV7At } from "./ids.js";
import { BookCurrency } from "./payment.js";
import type { Payment } from "./payment.js";
import { MonthSchema, millisOfDay, monthOfMillis } from "./period.js";
import type { Month } from "./period.js";
import type { CatalogSnapshot, CategorizeRule } from "./snapshot.js";

const decode = Schema.decodeSync;

const bookProfileId = decode(ProfileIdSchema)(
  "0197a000-0000-7a00-8a00-000000000001"
);

const demoMonths = ["2026-01", "2026-02", "2026-03"] as const;

const category = (id: string): CategoryId => decode(CategoryIdSchema)(id);

export const demoCategoryIds = {
  coffee: category("0197a000-0002-7a02-8a02-000000000002"),
  everythingElse: category("0197a000-0008-7a08-8a08-000000000008"),
  groceries: category("0197a000-0003-7a03-8a03-000000000003"),
  living: category("0197a000-0001-7a01-8a01-000000000001"),
  personal: category("0197a000-0007-7a07-8a07-000000000007"),
  software: category("0197a000-0005-7a05-8a05-000000000005"),
  travel: category("0197a000-0006-7a06-8a06-000000000006"),
  utilities: category("0197a000-0004-7a04-8a04-000000000004"),
  work: category("0197a000-0009-7a09-8a09-000000000009"),
} as const;

const categories: CatalogSnapshot["categories"] = [
  {
    archived: false,
    color: "#0f766e",
    id: demoCategoryIds.living,
    name: "Living",
    parentId: null,
    profileId: bookProfileId,
    spendingType: "personal",
  },
  {
    archived: false,
    color: "#15803d",
    id: demoCategoryIds.groceries,
    name: "Groceries",
    parentId: demoCategoryIds.living,
    profileId: bookProfileId,
    spendingType: "personal",
  },
  {
    archived: false,
    color: "#0369a1",
    id: demoCategoryIds.utilities,
    name: "Utilities",
    parentId: demoCategoryIds.living,
    profileId: bookProfileId,
    spendingType: "personal",
  },
  {
    archived: false,
    color: "#be123c",
    id: demoCategoryIds.coffee,
    name: "Coffee",
    parentId: demoCategoryIds.living,
    profileId: bookProfileId,
    spendingType: "personal",
  },
  {
    archived: false,
    color: "#7c2d12",
    id: demoCategoryIds.work,
    name: "Work",
    parentId: null,
    profileId: bookProfileId,
    spendingType: "business",
  },
  {
    archived: false,
    color: "#6d28d9",
    id: demoCategoryIds.software,
    name: "Software",
    parentId: demoCategoryIds.work,
    profileId: bookProfileId,
    spendingType: "business",
  },
  {
    archived: false,
    color: "#b45309",
    id: demoCategoryIds.travel,
    name: "Travel",
    parentId: demoCategoryIds.work,
    profileId: bookProfileId,
    spendingType: "business",
  },
  {
    archived: false,
    color: "#be123c",
    id: demoCategoryIds.personal,
    name: "Personal",
    parentId: null,
    profileId: bookProfileId,
    spendingType: "personal",
  },
  {
    archived: false,
    color: "#525252",
    id: demoCategoryIds.everythingElse,
    name: "Everything else",
    parentId: null,
    profileId: bookProfileId,
    spendingType: "mixed",
  },
];

const payeeId = (id: string): PayeeId => decode(PayeeIdSchema)(id);

const payeeIds = {
  cinema: payeeId("0197a000-0010-7a10-8a10-000000000010"),
  cloud: payeeId("0197a000-0011-7a11-8a11-000000000011"),
  coffee: payeeId("0197a000-0012-7a12-8a12-000000000012"),
  energy: payeeId("0197a000-0013-7a13-8a13-000000000013"),
  example: payeeId("0197a000-0014-7a14-8a14-000000000014"),
  grocer: payeeId("0197a000-0015-7a15-8a15-000000000015"),
  rail: payeeId("0197a000-0016-7a16-8a16-000000000016"),
  taxOffice: payeeId("0197a000-0017-7a17-8a17-000000000017"),
} as const;

const payee = (
  id: PayeeId,
  name: string,
  kind: PayeeKind,
  defaultCategoryId: CategoryId | null
): Payee => ({
  archived: false,
  defaultCategoryId,
  id,
  kind,
  name,
  normalizedName: decode(DisplayNameSchema)(normalizeName(name)),
  profileId: bookProfileId,
});

const payees: CatalogSnapshot["payees"] = [
  payee(payeeIds.cinema, "Demo Cinema", "merchant", demoCategoryIds.personal),
  payee(
    payeeIds.cloud,
    "Demo Cloud Hosting",
    "merchant",
    demoCategoryIds.software
  ),
  payee(payeeIds.coffee, "Demo Coffee", "merchant", demoCategoryIds.coffee),
  payee(payeeIds.energy, "Demo Energy", "merchant", demoCategoryIds.utilities),
  payee(payeeIds.example, "Example Ltd", "client", null),
  payee(payeeIds.grocer, "Demo Grocer", "merchant", demoCategoryIds.groceries),
  payee(payeeIds.rail, "Demo Rail", "merchant", demoCategoryIds.travel),
  payee(payeeIds.taxOffice, "Demo Tax Office", "tax_authority", null),
];

const alias = (
  index: number,
  pattern: string,
  matchType: MerchantAlias["matchType"],
  owner: PayeeId
): MerchantAlias => ({
  id: decode(AliasIdSchema)(uuidV7At(1_767_225_600_000, index)),
  matchType,
  pattern: decode(DisplayNameSchema)(pattern),
  payeeId: owner,
  profileId: bookProfileId,
});

const aliases: CatalogSnapshot["aliases"] = [
  alias(900, "cloud hosting", "contains", payeeIds.cloud),
  alias(901, "coffee shop", "contains", payeeIds.coffee),
  alias(902, "DEMO GROC", "prefix", payeeIds.grocer),
  alias(903, "Demo Energy Ltd", "exact", payeeIds.energy),
];

const rule = (
  index: number,
  pattern: string,
  categoryId: CategoryId,
  priority: number,
  direction: RuleDirection,
  minAmount: number | null = null
): CategorizeRule => ({
  categoryId,
  direction,
  enabled: true,
  id: decode(RuleIdSchema)(uuidV7At(1_767_225_600_000, 800 + index)),
  kind: "categorize",
  matchField: "merchant",
  matchType: "contains",
  maxAmount: Option.none<Minor>(),
  minAmount:
    minAmount === null
      ? Option.none<Minor>()
      : Option.some(minorUnits(minAmount)),
  pattern: decode(DisplayNameSchema)(pattern),
  priority,
  profileId: bookProfileId,
});

const rules: CatalogSnapshot["rules"] = [
  rule(1, "Demo Grocer", demoCategoryIds.groceries, 10, "out"),
  rule(2, "Demo Energy", demoCategoryIds.utilities, 9, "out"),
  rule(3, "Demo Cloud Hosting", demoCategoryIds.software, 8, "out"),
  rule(4, "Demo Rail", demoCategoryIds.travel, 7, "out"),
  rule(5, "Demo Coffee", demoCategoryIds.coffee, 6, "out", 2000),
  rule(6, "Example Ltd", demoCategoryIds.everythingElse, 5, "in"),
];

interface Template {
  readonly categoryId: CategoryId | null;
  readonly days: readonly number[];
  readonly description: string;
  readonly direction: Payment["direction"];
  readonly merchant: string;
  readonly minor: number;
  readonly reference: string;
  readonly reviewed: boolean;
  readonly source: Payment["source"];
}

const templates: readonly Template[] = [
  {
    categoryId: demoCategoryIds.groceries,
    days: [3, 10, 17, 24],
    description: "Weekly groceries",
    direction: "out",
    merchant: "Demo Grocer",
    minor: 8640,
    reference: "",
    reviewed: true,
    source: "rule",
  },
  {
    categoryId: null,
    days: [5, 19],
    description: "Coffee with a supplier",
    direction: "out",
    merchant: "THE DEMO COFFEE SHOP",
    minor: 540,
    reference: "",
    reviewed: false,
    source: "rule",
  },
  {
    categoryId: null,
    days: [12],
    description: "Team breakfast",
    direction: "out",
    merchant: "Demo Coffee",
    minor: 1890,
    reference: "",
    reviewed: false,
    source: "rule",
  },
  {
    categoryId: demoCategoryIds.utilities,
    days: [8],
    description: "Electricity and gas",
    direction: "out",
    merchant: "Demo Energy",
    minor: 9200,
    reference: "",
    reviewed: true,
    source: "rule",
  },
  {
    categoryId: demoCategoryIds.utilities,
    days: [28],
    description: "Electricity and gas",
    direction: "out",
    merchant: "Demo Energy Ltd",
    minor: 1150,
    reference: "",
    reviewed: true,
    source: "rule",
  },
  {
    categoryId: demoCategoryIds.software,
    days: [2],
    description: "Cloud hosting",
    direction: "out",
    merchant: "Demo Cloud Hosting",
    minor: 2490,
    reference: "",
    reviewed: true,
    source: "rule",
  },
  {
    categoryId: demoCategoryIds.travel,
    days: [14],
    description: "Rail ticket",
    direction: "out",
    merchant: "Demo Rail",
    minor: 4250,
    reference: "",
    reviewed: true,
    source: "rule",
  },
  {
    categoryId: demoCategoryIds.everythingElse,
    days: [20],
    description: "VAT payment",
    direction: "out",
    merchant: "Demo Tax Office",
    minor: 250_000,
    reference: "TAX-VAT-2026",
    reviewed: true,
    source: "manual",
  },
  {
    categoryId: demoCategoryIds.personal,
    days: [22],
    description: "Cinema tickets",
    direction: "out",
    merchant: "Demo Cinema",
    minor: 1650,
    reference: "",
    reviewed: false,
    source: "manual",
  },
  {
    categoryId: null,
    days: [6],
    description: "Invoice payment",
    direction: "in",
    merchant: "Example Ltd",
    minor: 480_000,
    reference: "INV-2026-014",
    reviewed: true,
    source: "rule",
  },
  {
    categoryId: null,
    days: [15],
    description: "Moved to Demo Savings",
    direction: "neutral",
    merchant: "",
    minor: 100_000,
    reference: "",
    reviewed: true,
    source: "rule",
  },
];

const paymentsFor = (month: Month): readonly Payment[] =>
  templates.flatMap((template) =>
    template.days.map((day) => {
      const occurredAt = millisOfDay(month, day, 10);

      return {
        amountMinor: minorUnits(template.minor),
        categoryId: template.categoryId,
        currency: BookCurrency,
        description: template.description,
        direction: template.direction,
        id: decode(PaymentIdSchema)(uuidV7At(occurredAt, day)),
        merchant: template.merchant,
        occurredAt,
        reference: template.reference,
        reviewed: template.reviewed,
        source: template.source,
      };
    })
  );

const payments: readonly Payment[] = demoMonths.flatMap((month) =>
  paymentsFor(decode(MonthSchema)(month))
);

const latest = Math.max(...payments.map((payment) => payment.occurredAt));

export const demoLatestMonth = monthOfMillis(
  decode(TimestampMillisSchema)(latest)
);

export const demoCatalog: CatalogSnapshot = {
  aliases,
  categories,
  payees,
  payments,
  profileId: bookProfileId,
  rules,
};
