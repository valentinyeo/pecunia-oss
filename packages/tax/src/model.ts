import {
  DateOnlySchema,
  MoneySchema,
  ProfileIdSchema,
  TaxObligationSchema,
  TaxObligationStatusSchema,
  TaxProfileIdSchema,
  TaxProfileSchema,
} from "@pecunia/core/model";
import { Schema } from "effect";

export const DueDeclarationSchema = Schema.Struct({
  amount: MoneySchema,
  dueOn: DateOnlySchema,
  kind: Schema.NonEmptyString,
  label: Schema.String,
  periodEndsOn: DateOnlySchema,
  status: TaxObligationStatusSchema,
});

export type DueDeclaration = typeof DueDeclarationSchema.Type;

export const ListTaxDuesRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type ListTaxDuesRequest = typeof ListTaxDuesRequestSchema.Type;

export const SyncTaxDuesRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
  taxProfileId: TaxProfileIdSchema,
});

export type SyncTaxDuesRequest = typeof SyncTaxDuesRequestSchema.Type;

export const TaxDuesSchema = Schema.Struct({
  dues: Schema.Array(TaxObligationSchema),
  taxProfiles: Schema.Array(TaxProfileSchema),
});

export type TaxDues = typeof TaxDuesSchema.Type;

const count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const SyncReceiptSchema = Schema.Struct({
  inserted: count,
  removed: count,
  unchanged: count,
  updated: count,
});

export type SyncReceipt = typeof SyncReceiptSchema.Type;
