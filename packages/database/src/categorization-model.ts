import {
  AliasMatchTypeSchema,
  CategoryIdSchema,
  CategorySchema,
  DisplayNameSchema,
  MerchantAliasSchema,
  PayeeIdSchema,
  PayeeKindSchema,
  PayeeSchema,
  ProfileIdSchema,
  RuleSchema,
  SpendingTypeSchema,
} from "@pecunia/categorize";
import { Schema } from "effect";

export const CategorizationOperationSchema = Schema.Literals([
  "createAlias",
  "createCategory",
  "createPayee",
  "createRule",
  "decide",
  "listAliases",
  "listCategories",
  "listPayees",
  "listRules",
  "replaceRule",
  "snapshot",
]);

export type CategorizationOperation = typeof CategorizationOperationSchema.Type;

export class CategorizationError extends Schema.TaggedError<
  CategorizationError,
  { readonly brand: unique symbol }
>()("CategorizationError", {
  cause: Schema.Defect(),
  operation: CategorizationOperationSchema,
}) {}

export const CreateCategoryInputSchema = Schema.Struct({
  color: DisplayNameSchema,
  name: DisplayNameSchema,
  parentId: Schema.NullOr(CategoryIdSchema),
  profileId: ProfileIdSchema,
  spendingType: SpendingTypeSchema,
});

export type CreateCategoryInput = typeof CreateCategoryInputSchema.Type;

export const CreatePayeeInputSchema = Schema.Struct({
  defaultCategoryId: Schema.NullOr(CategoryIdSchema),
  kind: PayeeKindSchema,
  name: DisplayNameSchema,
  profileId: ProfileIdSchema,
});

export type CreatePayeeInput = typeof CreatePayeeInputSchema.Type;

export const CreateAliasInputSchema = Schema.Struct({
  matchType: AliasMatchTypeSchema,
  pattern: DisplayNameSchema,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
});

export type CreateAliasInput = typeof CreateAliasInputSchema.Type;

export const CategorizationSnapshotSchema = Schema.Struct({
  aliases: Schema.Array(MerchantAliasSchema),
  categories: Schema.Array(CategorySchema),
  payees: Schema.Array(PayeeSchema),
  rules: Schema.Array(RuleSchema),
});

export type CategorizationSnapshot = typeof CategorizationSnapshotSchema.Type;
