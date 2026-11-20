import {
  CategorySchema,
  MerchantAliasSchema,
  PayeeSchema,
  ProfileIdSchema,
  RuleSchema,
  isCategorizeRule,
} from "@pecunia/categorize";
import type { CategorizeRule } from "@pecunia/categorize";
import { Schema } from "effect";

import { BookCurrency, PaymentSchema } from "./payment.js";

export const CategorizeRuleSchema = RuleSchema.pipe(
  Schema.refine(isCategorizeRule, { expected: "a rule that picks a category" })
);

export type { CategorizeRule };

interface ProfiledRow {
  readonly profileId: string;
}

const oneBook = Schema.makeFilter<typeof CatalogSnapshotSchema.Type>(
  (snapshot) => {
    const rows: readonly ProfiledRow[] = [
      ...snapshot.categories,
      ...snapshot.payees,
      ...snapshot.aliases,
      ...snapshot.rules,
    ];

    return rows.every((row) => row.profileId === snapshot.profileId);
  },
  { expected: "rows from the one profile this book belongs to" }
);

const uniqueIds = Schema.makeFilter<typeof CatalogSnapshotSchema.Type>(
  (snapshot) => {
    const ids = [
      ...snapshot.categories.map((row) => row.id),
      ...snapshot.payees.map((row) => row.id),
      ...snapshot.aliases.map((row) => row.id),
      ...snapshot.payments.map((row) => row.id),
      ...snapshot.rules.map((row) => row.id),
    ];

    return new Set(ids).size === ids.length;
  },
  { expected: "one row per id across the book" }
);

const knownCategories = Schema.makeFilter<typeof CatalogSnapshotSchema.Type>(
  (snapshot) => {
    const ids = new Set<string>(snapshot.categories.map((row) => row.id));

    return snapshot.payments.every(
      (payment) => payment.categoryId === null || ids.has(payment.categoryId)
    );
  },
  { expected: "payments filed under categories this book holds" }
);

const oneCurrency = Schema.makeFilter<typeof CatalogSnapshotSchema.Type>(
  (snapshot) =>
    snapshot.payments.every((payment) => payment.currency === BookCurrency),
  { expected: `payments in the book currency, ${BookCurrency}` }
);

const oneNamePerPayee = Schema.makeFilter<typeof CatalogSnapshotSchema.Type>(
  (snapshot) => {
    const names = snapshot.payees.map((payee) => payee.normalizedName);

    return new Set(names).size === names.length;
  },
  { expected: "one payee per merchant name" }
);

export const CatalogSnapshotSchema = Schema.Struct({
  aliases: Schema.Array(MerchantAliasSchema),
  categories: Schema.Array(CategorySchema),
  payees: Schema.Array(PayeeSchema),
  payments: Schema.Array(PaymentSchema),
  profileId: ProfileIdSchema,
  rules: Schema.Array(CategorizeRuleSchema),
}).check(oneBook, uniqueIds, knownCategories, oneCurrency, oneNamePerPayee);

export type CatalogSnapshot = typeof CatalogSnapshotSchema.Type;
