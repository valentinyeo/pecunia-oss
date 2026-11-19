import {
  BankLineQuerySchema,
  BankLineSchema,
  CategoryChangeSchema,
  LineReviewSchema,
} from "@pecunia/bank-lines";

export const BankLineIdSchema = LineReviewSchema.fields.lineId;

export const CategoryIdSchema =
  CategoryChangeSchema.cases.Assigned.fields.categoryId;

export const DateOnlySchema = BankLineSchema.fields.valueDate;

export const PageLimitSchema = BankLineQuerySchema.fields.limit;

export const SearchTextSchema = BankLineQuerySchema.fields.search;

export const TimestampMillisSchema = BankLineSchema.fields.occurredAt;
