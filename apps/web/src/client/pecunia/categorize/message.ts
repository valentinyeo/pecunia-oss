import {
  AliasIdSchema,
  CategoryIdSchema,
  RuleIdSchema,
} from "@pecunia/categorize";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { MerchantFilterSchema } from "./catalog.js";
import {
  AliasFieldSchema,
  CategoryFieldSchema,
  MergeFieldSchema,
  RuleFieldSchema,
} from "./model.js";
import { CatalogSnapshotSchema } from "./snapshot.js";

export const FormSlotSchema = Schema.Literals([
  "alias",
  "category",
  "merge",
  "none",
  "rule",
]);

export type FormSlot = typeof FormSlotSchema.Type;

export const Message = defineMessageUnion({
  AppliedRules: {},
  AssignedMerchantCategory: {
    categoryId: Schema.String,
    key: Schema.NonEmptyString,
  },
  CancelledAlias: {},
  CancelledCategory: {},
  CancelledRule: {},
  ChangedPage: { page: Schema.Int },
  ChangedPeriod: { period: Schema.String },
  ChoseAliasPayee: { payeeId: Schema.NonEmptyString },
  CompletedWrite: {
    catalog: CatalogSnapshotSchema,
    form: FormSlotSchema,
    notice: Schema.NonEmptyString,
  },
  ConfirmedMerchant: { key: Schema.NonEmptyString },
  DeletedAlias: { id: AliasIdSchema },
  DeletedCategory: { id: CategoryIdSchema },
  DeletedRule: { id: RuleIdSchema },
  FailedWrite: { reason: Schema.NonEmptyString },
  FilteredMerchants: { filter: MerchantFilterSchema },
  MovedRule: { categoryId: Schema.String, id: RuleIdSchema },
  StartedCreateAlias: {},
  StartedCreateCategory: {},
  StartedCreateRule: {},
  StartedEditAlias: { id: AliasIdSchema },
  StartedEditCategory: { id: CategoryIdSchema },
  SubmittedAlias: {},
  SubmittedCategory: {},
  SubmittedMerge: {},
  SubmittedRename: { key: Schema.NonEmptyString },
  SubmittedRule: {},
  ToggledRule: { enabled: Schema.Boolean, id: RuleIdSchema },
  TypedAlias: { field: AliasFieldSchema, value: Schema.String },
  TypedCategory: { field: CategoryFieldSchema, value: Schema.String },
  TypedMerge: { field: MergeFieldSchema, value: Schema.String },
  TypedMerchantQuery: { value: Schema.String },
  TypedMerchantRename: { value: Schema.String },
  TypedRule: { field: RuleFieldSchema, value: Schema.String },
});

export type CategorizeMessageValue = typeof Message.Type;
