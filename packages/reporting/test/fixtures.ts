// oxlint-disable anti-slop-effect/no-manual-tagged-construction -- the fixture writes encoded wire rows for the model's `parse` door, which is the only constructor that accepts them
import type {
  Category,
  Classification,
  Payee,
  RateLookup,
  TaxObligation,
  Transaction,
} from "@pecunia/core/model";
import { codecs, parse } from "@pecunia/core/model";
import { Option, Schema } from "effect";

import type {
  CurrencyCode,
  DateOnly,
  MinorUnits,
  Money,
  PayeeId,
  ProfileId,
  YearMonth,
} from "../src/model.js";
import {
  DateOnlySchema,
  MinorUnitsSchema,
  MoneySchema,
  YearMonthSchema,
} from "../src/model.js";

export const seeded = (seed: number) => {
  let state = seed % 4_294_967_296;

  return (bound: number): number => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state % bound;
  };
};

export const CASES = 600;

export const uuidOf = (index: number): string =>
  `0192f0c1-${(index + 1).toString(16).padStart(4, "0")}-7abc-8def-${index
    .toString(16)
    .padStart(12, "0")}`;

export const profileId: ProfileId = parse(
  codecs.profileId,
  "0192f0c1-0001-7abc-8def-000000000001"
);

export const moneyOf = (code: string, minor: number): Money =>
  Schema.decodeSync(MoneySchema)({ currency: code, minor });

export const minorUnits = (value: number): MinorUnits =>
  Schema.decodeSync(MinorUnitsSchema)(value);

export const currencyOf = (code: string): CurrencyCode =>
  moneyOf(code, 0).currency;

export const dateOf = (text: string): DateOnly =>
  Schema.decodeSync(DateOnlySchema)(text);

export const monthOf = (text: string): YearMonth =>
  Schema.decodeSync(YearMonthSchema)(text);

export const rateOf = (text: string) => parse(codecs.rate, text);

export const payeeIdOf = (text: string): PayeeId => parse(codecs.payeeId, text);

export const rateLookupOf = (
  entries: readonly {
    readonly from: string;
    readonly rate: string;
    readonly to: string;
  }[]
): RateLookup => {
  const rates = entries.map((entry) => ({
    from: currencyOf(entry.from),
    rate: rateOf(entry.rate),
    to: currencyOf(entry.to),
  }));

  return (query) =>
    Option.fromNullishOr(
      rates.find((rate) => rate.from === query.from && rate.to === query.to)
        ?.rate
    );
};

export const rateLookup = rateLookupOf([
  { from: "USD", rate: "0.92", to: "EUR" },
  { from: "EUR", rate: "1.1", to: "USD" },
  { from: "GBP", rate: "1.17", to: "EUR" },
  { from: "EUR", rate: "1", to: "JPY" },
]);

export const classificationOf = (
  kind: Classification["_tag"],
  clientPayeeId = uuidOf(900)
) => {
  if (kind === "Income") {
    return { _tag: "Income", clientPayeeId, ruleId: uuidOf(901) };
  }

  if (kind === "TaxPayment") {
    return { _tag: "TaxPayment", obligationKind: "vat", ruleId: uuidOf(902) };
  }

  if (kind === "InternalTransfer") {
    return { _tag: "InternalTransfer", ruleId: uuidOf(903) };
  }

  if (kind === "Excluded") {
    return { _tag: "Excluded", ruleId: uuidOf(904) };
  }

  if (kind === "Refund") {
    return { _tag: "Refund", ofPayeeId: clientPayeeId, ruleId: uuidOf(905) };
  }

  return { _tag: "None" };
};

export interface LineSeed {
  readonly categoryId?: string;
  readonly classification?: Classification["_tag"];
  readonly clientPayeeId?: string;
  readonly currency?: string;
  readonly direction?: "in" | "out" | "neutral";
  readonly id: number;
  readonly merchant?: string;
  readonly minor: number;
  readonly payeeId?: string;
  readonly status?: "pending" | "posted" | "reversed";
  readonly valueDate: string;
}

export const transactionOf = (seed: LineSeed): Transaction => {
  const currency = seed.currency ?? "EUR";
  const occurredAt = `${seed.valueDate}T10:00:00.000Z`;
  const { categoryId } = seed;

  return parse(codecs.transaction, {
    amounts: {
      _tag: "SameCurrency",
      amount: { currency, minor: seed.minor },
    },
    categorization:
      categoryId === undefined
        ? { _tag: "None" }
        : { _tag: "Confirmed", at: occurredAt, categoryId },
    classification: classificationOf(
      seed.classification ?? "None",
      seed.clientPayeeId
    ),
    createdAt: occurredAt,
    direction: seed.direction ?? "out",
    externalId: `external-${seed.id}`,
    fee: null,
    id: uuidOf(seed.id),
    note: "",
    occurredAt,
    payeeId: seed.payeeId ?? null,
    profileId,
    providerAccountId: uuidOf(5000),
    raw: {
      description: seed.merchant ?? "",
      merchant: seed.merchant ?? "",
      reference: "",
    },
    status: seed.status ?? "posted",
    valueDate: seed.valueDate,
  });
};

export const foreignTransactionOf = (
  seed: LineSeed & {
    readonly baseCurrency: string;
    readonly baseMinor: number;
    readonly rate: string;
  }
): Transaction => {
  const occurredAt = `${seed.valueDate}T10:00:00.000Z`;

  return parse(codecs.transaction, {
    amounts: {
      _tag: "Converted",
      asOf: seed.valueDate,
      base: { currency: seed.baseCurrency, minor: seed.baseMinor },
      rate: seed.rate,
      source: { currency: seed.currency ?? "USD", minor: seed.minor },
    },
    categorization:
      seed.categoryId === undefined
        ? { _tag: "None" }
        : { _tag: "Confirmed", at: occurredAt, categoryId: seed.categoryId },
    classification: classificationOf(
      seed.classification ?? "None",
      seed.clientPayeeId
    ),
    createdAt: occurredAt,
    direction: seed.direction ?? "out",
    externalId: `external-${seed.id}`,
    fee: null,
    id: uuidOf(seed.id),
    note: "",
    occurredAt,
    payeeId: seed.payeeId ?? null,
    profileId,
    providerAccountId: uuidOf(5000),
    raw: {
      description: seed.merchant ?? "",
      merchant: seed.merchant ?? "",
      reference: "",
    },
    status: seed.status ?? "posted",
    valueDate: seed.valueDate,
  });
};

export const categoryOf = (
  id: string,
  name: string,
  spendingType: "business" | "mixed" | "personal",
  parentId: string | null,
  archivedAt: string | null = null
): Category =>
  parse(codecs.category, {
    archivedAt,
    color: "#334155",
    id,
    name,
    parentId,
    profileId,
    spendingType,
  });

export const payeeOf = (id: string, name: string): Payee =>
  parse(codecs.payee, {
    archivedAt: null,
    defaultCategoryId: null,
    id,
    kind: "client",
    name,
    profileId,
  });

const statusWireOf = (status: "Estimated" | "Paid" | "WrittenOff") => {
  if (status === "Estimated") {
    return { _tag: "Estimated" as const, booksStatus: "open" };
  }

  if (status === "Paid") {
    return {
      _tag: "Paid" as const,
      at: "2024-03-20T10:00:00.000Z",
      settledBy: uuidOf(77),
    };
  }

  return { _tag: "WrittenOff" as const, reason: "Example relief" };
};

export const obligationOf = (
  id: string,
  minor: number,
  currency: string,
  status: "Estimated" | "Paid" | "WrittenOff"
): TaxObligation =>
  parse(codecs.taxObligation, {
    amount: { currency, minor },
    dueOn: "2024-04-30",
    id,
    kind: "vat",
    label: "VAT quarter",
    periodEndsOn: "2024-03-31",
    profileId,
    status: statusWireOf(status),
    syncedAt: "2024-03-15T10:00:00.000Z",
    taxProfileId: uuidOf(64),
  });
