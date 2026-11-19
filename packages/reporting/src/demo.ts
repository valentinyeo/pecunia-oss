// oxlint-disable anti-slop-effect/no-manual-tagged-construction -- the demo book is written as encoded wire rows, and the model's `parse` door is the only constructor that accepts them
import type { Person } from "@pecunia/access";
import { PersonSchema } from "@pecunia/access";
import type {
  Category,
  Payee,
  TaxObligation,
  Transaction,
} from "@pecunia/core/model";
import { codecs, parse } from "@pecunia/core/model";
import { Schema } from "effect";

import type {
  MemoryRate,
  MemoryReportBook,
  MemoryReportSeed,
} from "./memory.js";
import type {
  AccountBalance,
  CategoryId,
  CurrencyCode,
  DateOnly,
  ProfileId,
} from "./model.js";
import { AccountBalanceSchema } from "./model.js";

export const demoProfileId: ProfileId = parse(
  codecs.profileId,
  "0192f0c1-0001-7abc-8def-000000000001"
);

export const demoBaseCurrency: CurrencyCode = parse(codecs.currencyCode, "EUR");

export const demoToday: DateOnly = parse(codecs.dateOnly, "2024-03-15");

export const secondProfileId: ProfileId = parse(
  codecs.profileId,
  "0192f0c1-0002-7abc-8def-000000000002"
);

export const secondBaseCurrency: CurrencyCode = parse(
  codecs.currencyCode,
  "GBP"
);

export const secondToday: DateOnly = parse(codecs.dateOnly, "2024-06-15");

const id = (group: number, index: number): string =>
  `0192f0c1-${String(group).padStart(4, "0")}-7abc-8def-${String(index).padStart(12, "0")}`;

const ruleId = (index: number): string => id(80, index);

const at = (date: string, hour = 10): string =>
  `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;

const categoryNames = {
  groceries: id(16, 3),
  living: id(16, 2),
  rent: id(16, 1),
  software: id(16, 6),
  transport: id(16, 5),
  travel: id(16, 4),
} as const;

const payeeIds = {
  ferry: id(32, 7),
  lettings: id(32, 3),
  market: id(32, 4),
  saas: id(32, 6),
  studio: id(32, 2),
  taxOffice: id(32, 8),
  transit: id(32, 5),
  exampleLtd: id(32, 1),
} as const;

const accounts = {
  current: id(2, 1),
  savings: id(2, 2),
  usd: id(2, 3),
} as const;

const eur = (minor: number) => ({ currency: "EUR", minor });

const usd = (minor: number) => ({ currency: "USD", minor });

const same = (currency: string, minor: number) => ({
  _tag: "SameCurrency" as const,
  amount: { currency, minor },
});

const converted = (minor: number, sourceMinor: number, asOf: string) => ({
  _tag: "Converted" as const,
  asOf,
  base: eur(minor),
  rate: "0.92",
  source: usd(sourceMinor),
});

const confirmed = (categoryId: string, date: string) => ({
  _tag: "Confirmed" as const,
  at: at(date),
  categoryId,
});

const applied = (categoryId: string, date: string) => ({
  _tag: "Applied" as const,
  at: at(date),
  categoryId,
  ruleId: ruleId(1),
});

const unclassified = { _tag: "None" as const };

const uncategorised = { _tag: "None" as const };

const incomeFrom = (clientPayeeId: string) => ({
  _tag: "Income" as const,
  clientPayeeId,
  ruleId: ruleId(2),
});

const refundOf = (payeeId: string) => ({
  _tag: "Refund" as const,
  ofPayeeId: payeeId,
  ruleId: ruleId(3),
});

const taxPayment = {
  _tag: "TaxPayment" as const,
  obligationKind: "vat",
  ruleId: ruleId(4),
};

const internalTransfer = {
  _tag: "InternalTransfer" as const,
  ruleId: ruleId(5),
};

interface WireLine {
  readonly account: string;
  readonly amounts: ReturnType<typeof same> | ReturnType<typeof converted>;
  readonly categorization:
    | ReturnType<typeof applied>
    | ReturnType<typeof confirmed>
    | typeof uncategorised;
  readonly classification:
    | typeof unclassified
    | ReturnType<typeof incomeFrom>
    | ReturnType<typeof refundOf>
    | typeof taxPayment
    | typeof internalTransfer;
  readonly direction: "in" | "neutral" | "out";
  readonly merchant: string;
  readonly payee: string | null;
  readonly reference: string;
  readonly status: "pending" | "posted" | "reversed";
  readonly transactionId: string;
  readonly valueDate: string;
}

const lineOf = (
  line: WireLine,
  profileId: ProfileId = demoProfileId
): Transaction => {
  const occurredAt = at(line.valueDate);

  return parse(codecs.transaction, {
    amounts: line.amounts,
    categorization: line.categorization,
    classification: line.classification,
    createdAt: occurredAt,
    direction: line.direction,
    externalId: line.transactionId,
    fee: null,
    id: line.transactionId,
    note: "",
    occurredAt,
    payeeId: line.payee,
    profileId,
    providerAccountId: line.account,
    raw: {
      description: line.merchant,
      merchant: line.merchant,
      reference: line.reference,
    },
    status: line.status,
    valueDate: line.valueDate,
  });
};

const transactionIds = {
  aprilIncome: id(48, 14),
  aprilRent: id(48, 15),
  februaryGroceries: id(48, 16),
  marchFerry: id(48, 9),
  marchGroceriesOne: id(48, 3),
  marchGroceriesThree: id(48, 11),
  marchGroceriesTwo: id(48, 4),
  marchIncome: id(48, 1),
  marchInternal: id(48, 13),
  marchPending: id(48, 12),
  marchRefund: id(48, 5),
  marchRent: id(48, 2),
  marchSaas: id(48, 7),
  marchStudio: id(48, 8),
  marchTax: id(48, 10),
  marchTransit: id(48, 6),
} as const;

export const demoTransactions: readonly Transaction[] = [
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 150_000),
    categorization: uncategorised,
    classification: incomeFrom(payeeIds.exampleLtd),
    direction: "in",
    merchant: "Example Ltd",
    payee: payeeIds.exampleLtd,
    reference: "INV-2024-014 Example Ltd",
    status: "posted",
    transactionId: transactionIds.marchIncome,
    valueDate: "2024-03-02",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 45_000),
    categorization: applied(categoryNames.rent, "2024-03-03"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Lettings",
    payee: payeeIds.lettings,
    reference: "",
    status: "posted",
    transactionId: transactionIds.marchRent,
    valueDate: "2024-03-03",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 12_345),
    categorization: confirmed(categoryNames.groceries, "2024-03-05"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Market",
    payee: payeeIds.market,
    reference: "CARD-0001",
    status: "posted",
    transactionId: transactionIds.marchGroceriesOne,
    valueDate: "2024-03-05",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 10_000),
    categorization: confirmed(categoryNames.groceries, "2024-03-07"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Market",
    payee: payeeIds.market,
    reference: "CARD-0002",
    status: "posted",
    transactionId: transactionIds.marchGroceriesTwo,
    valueDate: "2024-03-07",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 2500),
    categorization: uncategorised,
    classification: refundOf(payeeIds.market),
    direction: "in",
    merchant: "Demo Market",
    payee: payeeIds.market,
    reference: "REFUND-0001",
    status: "posted",
    transactionId: transactionIds.marchRefund,
    valueDate: "2024-03-08",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 4000),
    categorization: confirmed(categoryNames.transport, "2024-03-09"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Transit",
    payee: payeeIds.transit,
    reference: "TRANSIT-1",
    status: "posted",
    transactionId: transactionIds.marchTransit,
    valueDate: "2024-03-09",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 12_000),
    categorization: confirmed(categoryNames.software, "2024-03-12"),
    classification: unclassified,
    direction: "out",
    merchant: "Example SaaS",
    payee: payeeIds.saas,
    reference: "SAAS-03",
    status: "posted",
    transactionId: transactionIds.marchSaas,
    valueDate: "2024-03-12",
  }),
  lineOf({
    account: accounts.usd,
    amounts: converted(55_200, 60_000, "2024-03-15"),
    categorization: uncategorised,
    classification: incomeFrom(payeeIds.studio),
    direction: "in",
    merchant: "Example Studio Ltd",
    payee: payeeIds.studio,
    reference: "INV-2024-021 Example Studio",
    status: "posted",
    transactionId: transactionIds.marchStudio,
    valueDate: "2024-03-15",
  }),
  lineOf({
    account: accounts.usd,
    amounts: converted(4600, 5000, "2024-03-18"),
    categorization: confirmed(categoryNames.travel, "2024-03-18"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Ferry",
    payee: payeeIds.ferry,
    reference: "FERRY-1",
    status: "posted",
    transactionId: transactionIds.marchFerry,
    valueDate: "2024-03-18",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 20_000),
    categorization: uncategorised,
    classification: taxPayment,
    direction: "out",
    merchant: "Example Tax Office",
    payee: payeeIds.taxOffice,
    reference: "VAT-Q1",
    status: "posted",
    transactionId: transactionIds.marchTax,
    valueDate: "2024-03-20",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 3000),
    categorization: confirmed(categoryNames.groceries, "2024-03-22"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Market",
    payee: payeeIds.market,
    reference: "CARD-0003",
    status: "posted",
    transactionId: transactionIds.marchGroceriesThree,
    valueDate: "2024-03-22",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 9999),
    categorization: confirmed(categoryNames.groceries, "2024-03-25"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Market",
    payee: payeeIds.market,
    reference: "CARD-0004",
    status: "pending",
    transactionId: transactionIds.marchPending,
    valueDate: "2024-03-25",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 5000),
    categorization: uncategorised,
    classification: internalTransfer,
    direction: "out",
    merchant: "Demo Bank",
    payee: null,
    reference: "TRANSFER-1",
    status: "posted",
    transactionId: transactionIds.marchInternal,
    valueDate: "2024-03-26",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 90_000),
    categorization: uncategorised,
    classification: incomeFrom(payeeIds.exampleLtd),
    direction: "in",
    merchant: "Example Ltd",
    payee: payeeIds.exampleLtd,
    reference: "INV-2024-030 Example Ltd",
    status: "posted",
    transactionId: transactionIds.aprilIncome,
    valueDate: "2024-04-01",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 20_000),
    categorization: applied(categoryNames.rent, "2024-04-04"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Lettings",
    payee: payeeIds.lettings,
    reference: "",
    status: "posted",
    transactionId: transactionIds.aprilRent,
    valueDate: "2024-04-04",
  }),
  lineOf({
    account: accounts.current,
    amounts: same("EUR", 15_000),
    categorization: confirmed(categoryNames.groceries, "2024-02-10"),
    classification: unclassified,
    direction: "out",
    merchant: "Demo Market",
    payee: payeeIds.market,
    reference: "CARD-0000",
    status: "posted",
    transactionId: transactionIds.februaryGroceries,
    valueDate: "2024-02-10",
  }),
];

const categoryOf = (
  categoryId: string,
  name: string,
  spendingType: "business" | "mixed" | "personal",
  parentId: string | null,
  archivedAt: string | null,
  profileId: ProfileId = demoProfileId
): Category =>
  parse(codecs.category, {
    archivedAt,
    color: "#334155",
    id: categoryId,
    name,
    parentId,
    profileId,
    spendingType,
  });

export const demoCategories: readonly Category[] = [
  categoryOf(categoryNames.rent, "Rent", "personal", null, null),
  categoryOf(categoryNames.living, "Living", "personal", null, null),
  categoryOf(
    categoryNames.groceries,
    "Groceries",
    "personal",
    categoryNames.living,
    null
  ),
  categoryOf(
    categoryNames.travel,
    "Travel",
    "personal",
    categoryNames.living,
    null
  ),
  categoryOf(categoryNames.transport, "Transport", "personal", null, null),
  categoryOf(categoryNames.software, "Software", "business", null, null),
  categoryOf(
    id(16, 7),
    "Old category",
    "mixed",
    null,
    "2024-01-31T10:00:00.000Z"
  ),
];

const payeeOf = (
  payeeId: string,
  name: string,
  kind: "client" | "employer" | "merchant" | "tax_authority",
  profileId: ProfileId = demoProfileId
): Payee =>
  parse(codecs.payee, {
    archivedAt: null,
    defaultCategoryId: null,
    id: payeeId,
    kind,
    name,
    profileId,
  });

export const demoPayees: readonly Payee[] = [
  payeeOf(payeeIds.exampleLtd, "Example Ltd", "client"),
  payeeOf(payeeIds.studio, "Example Studio", "client"),
  payeeOf(payeeIds.lettings, "Demo Lettings", "merchant"),
  payeeOf(payeeIds.market, "Demo Market", "merchant"),
  payeeOf(payeeIds.transit, "Demo Transit", "merchant"),
  payeeOf(payeeIds.saas, "Example SaaS", "merchant"),
  payeeOf(payeeIds.ferry, "Demo Ferry", "merchant"),
  payeeOf(payeeIds.taxOffice, "Example Tax Office", "tax_authority"),
];

type ObligationStatusWire =
  | { readonly _tag: "Estimated"; readonly booksStatus: string }
  | { readonly _tag: "Paid"; readonly at: string; readonly settledBy: string }
  | { readonly _tag: "WrittenOff"; readonly reason: string };

const obligationOf = (
  obligationId: string,
  amountMinor: number,
  status: ObligationStatusWire
): TaxObligation =>
  parse(codecs.taxObligation, {
    amount: eur(amountMinor),
    dueOn: "2024-04-30",
    id: obligationId,
    kind: "vat",
    label: "VAT quarter",
    periodEndsOn: "2024-03-31",
    profileId: demoProfileId,
    status,
    syncedAt: "2024-03-15T10:00:00.000Z",
    taxProfileId: id(64, 1),
  });

export const demoObligations: readonly TaxObligation[] = [
  obligationOf(id(65, 1), 120_000, { _tag: "Estimated", booksStatus: "open" }),
  obligationOf(id(65, 2), 50_000, {
    _tag: "Paid",
    at: "2024-02-20T10:00:00.000Z",
    settledBy: transactionIds.marchTax,
  }),
  obligationOf(id(65, 3), 10_000, {
    _tag: "WrittenOff",
    reason: "Example relief",
  }),
];

const balanceOf = (
  accountId: string,
  name: string,
  kind: "brokerage" | "current" | "jar" | "savings",
  currency: CurrencyCode,
  minor: number
): AccountBalance =>
  Schema.decodeSync(AccountBalanceSchema)({
    accountId,
    balance: { currency, minor },
    kind,
    name,
  });

const usdCurrency = parse(codecs.currencyCode, "USD");

export const demoAccounts: readonly AccountBalance[] = [
  balanceOf(
    accounts.current,
    "Demo Bank Current",
    "current",
    demoBaseCurrency,
    250_000
  ),
  balanceOf(
    accounts.savings,
    "Demo Bank Savings",
    "savings",
    demoBaseCurrency,
    80_000
  ),
  balanceOf(accounts.usd, "Demo Bank Dollar", "current", usdCurrency, 100_000),
];

export const demoRates: readonly MemoryRate[] = [
  { from: usdCurrency, rate: parse(codecs.rate, "0.92"), to: demoBaseCurrency },
];

const secondCategoryIds = {
  housing: id(17, 1),
} as const;

const secondPayeeIds = {
  garden: id(33, 1),
  housing: id(33, 2),
} as const;

const secondAccounts = {
  current: id(3, 1),
} as const;

export const demoLivingCategoryId: CategoryId = parse(
  codecs.categoryId,
  categoryNames.living
);

export const secondHousingCategoryId: CategoryId = parse(
  codecs.categoryId,
  secondCategoryIds.housing
);

export const secondCategories: readonly Category[] = [
  categoryOf(
    secondCategoryIds.housing,
    "Housing",
    "personal",
    null,
    null,
    secondProfileId
  ),
];

export const secondPayees: readonly Payee[] = [
  payeeOf(
    secondPayeeIds.garden,
    "Example Garden Ltd",
    "client",
    secondProfileId
  ),
  payeeOf(secondPayeeIds.housing, "Demo Housing", "merchant", secondProfileId),
];

export const secondTransactions: readonly Transaction[] = [
  lineOf(
    {
      account: secondAccounts.current,
      amounts: same("GBP", 7000),
      categorization: uncategorised,
      classification: incomeFrom(secondPayeeIds.garden),
      direction: "in",
      merchant: "Example Garden Ltd",
      payee: secondPayeeIds.garden,
      reference: "INV-2024-101 Example Garden",
      status: "posted",
      transactionId: id(49, 1),
      valueDate: "2024-06-04",
    },
    secondProfileId
  ),
  lineOf(
    {
      account: secondAccounts.current,
      amounts: same("GBP", 2500),
      categorization: confirmed(secondCategoryIds.housing, "2024-06-06"),
      classification: unclassified,
      direction: "out",
      merchant: "Demo Housing",
      payee: secondPayeeIds.housing,
      reference: "RENT-06",
      status: "posted",
      transactionId: id(49, 2),
      valueDate: "2024-06-06",
    },
    secondProfileId
  ),
  lineOf(
    {
      account: secondAccounts.current,
      amounts: same("GBP", 900),
      categorization: confirmed(secondCategoryIds.housing, "2024-06-08"),
      classification: unclassified,
      direction: "out",
      merchant: "Demo Housing",
      payee: secondPayeeIds.housing,
      reference: "RENT-07",
      status: "pending",
      transactionId: id(49, 3),
      valueDate: "2024-06-08",
    },
    secondProfileId
  ),
];

export const secondAccountsBalances: readonly AccountBalance[] = [
  balanceOf(
    secondAccounts.current,
    "Second Demo Bank Current",
    "current",
    secondBaseCurrency,
    30_000
  ),
];

export const secondBook: MemoryReportBook = {
  accounts: secondAccountsBalances,
  baseCurrency: secondBaseCurrency,
  categories: secondCategories,
  obligations: [],
  payees: secondPayees,
  profileId: secondProfileId,
  rates: [],
  today: secondToday,
  transactions: secondTransactions,
};

export const demoPerson: Person = Schema.decodeSync(PersonSchema)({
  email: "demo@example.com",
  memberships: [{ profileId: demoProfileId, role: "owner" }],
  personId: "person-demo",
});

export const demoBook: MemoryReportBook = {
  accounts: demoAccounts,
  baseCurrency: demoBaseCurrency,
  categories: demoCategories,
  obligations: demoObligations,
  payees: demoPayees,
  profileId: demoProfileId,
  rates: demoRates,
  today: demoToday,
  transactions: demoTransactions,
};

export const demoReportSeed: MemoryReportSeed = {
  books: [demoBook, secondBook],
  emptyBaseCurrency: demoBaseCurrency,
  emptyToday: demoToday,
};
