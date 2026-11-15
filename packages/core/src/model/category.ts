import { Option, Schema } from "effect";

import {
  AliasIdSchema,
  CategoryIdSchema,
  PayeeIdSchema,
  ProfileIdSchema,
  TimestampSchema,
} from "./primitives.js";
import type { CategoryId } from "./primitives.js";

export const SpendingTypeSchema = Schema.Literals([
  "business",
  "mixed",
  "personal",
]);

export type SpendingType = typeof SpendingTypeSchema.Type;

interface ParentedCategory {
  readonly id: CategoryId;
  readonly parentId: Option.Option<CategoryId>;
}

const parentIsAnotherCategory = Schema.makeFilter<ParentedCategory>(
  (category) =>
    Option.isNone(category.parentId) || category.parentId.value !== category.id,
  { expected: "a parent other than the category itself" }
);

export const CategorySchema = Schema.Struct({
  archivedAt: Schema.OptionFromNullishOr(TimestampSchema),
  color: Schema.NonEmptyString,
  id: CategoryIdSchema,
  name: Schema.NonEmptyString,
  parentId: Schema.OptionFromNullishOr(CategoryIdSchema),
  profileId: ProfileIdSchema,
  spendingType: SpendingTypeSchema,
}).check(parentIsAnotherCategory);

export type Category = typeof CategorySchema.Type;

export const PayeeKindSchema = Schema.Literals([
  "client",
  "employer",
  "merchant",
  "tax_authority",
]);

export type PayeeKind = typeof PayeeKindSchema.Type;

export const PayeeSchema = Schema.Struct({
  archivedAt: Schema.OptionFromNullishOr(TimestampSchema),
  defaultCategoryId: Schema.OptionFromNullishOr(CategoryIdSchema),
  id: PayeeIdSchema,
  kind: PayeeKindSchema,
  name: Schema.NonEmptyString,
  profileId: ProfileIdSchema,
});

export type Payee = typeof PayeeSchema.Type;

export const MerchantAliasSchema = Schema.Struct({
  aliasId: AliasIdSchema,
  matchType: Schema.Literals(["contains", "exact", "prefix"]),
  pattern: Schema.NonEmptyString,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
});

export type MerchantAlias = typeof MerchantAliasSchema.Type;
