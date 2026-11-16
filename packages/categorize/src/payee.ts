import { Schema } from "effect";

import { DisplayNameSchema } from "./amount.js";
import {
  AliasIdSchema,
  CategoryIdSchema,
  PayeeIdSchema,
  ProfileIdSchema,
} from "./ids.js";

export const PayeeKindSchema = Schema.Literals([
  "client",
  "employer",
  "merchant",
  "tax_authority",
]);

export type PayeeKind = typeof PayeeKindSchema.Type;

export const PayeeSchema = Schema.Struct({
  archived: Schema.Boolean,
  defaultCategoryId: Schema.NullOr(CategoryIdSchema),
  id: PayeeIdSchema,
  kind: PayeeKindSchema,
  name: DisplayNameSchema,
  normalizedName: DisplayNameSchema,
  profileId: ProfileIdSchema,
});

export type Payee = typeof PayeeSchema.Type;

export const AliasMatchTypeSchema = Schema.Literals([
  "contains",
  "exact",
  "prefix",
]);

export type AliasMatchType = typeof AliasMatchTypeSchema.Type;

export const MerchantAliasSchema = Schema.Struct({
  id: AliasIdSchema,
  matchType: AliasMatchTypeSchema,
  pattern: DisplayNameSchema,
  payeeId: PayeeIdSchema,
  profileId: ProfileIdSchema,
});

export type MerchantAlias = typeof MerchantAliasSchema.Type;
