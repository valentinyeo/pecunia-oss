import type { RejectedLine } from "@pecunia/core/bank-import";
import { Schema } from "effect";

export const DateOnlySchema = Schema.String.check(
  Schema.isPattern(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u)
).pipe(Schema.brand("DateOnly"));

export type DateOnly = typeof DateOnlySchema.Type;

export const FingerprintSchema = Schema.String.check(
  Schema.isPattern(/^csv-[0-9a-f]{64}$/u)
).pipe(Schema.brand("Fingerprint"));

export type Fingerprint = typeof FingerprintSchema.Type;

export const ParsedLineSchema = Schema.Struct({
  amountMinor: Schema.Int,
  currency: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
  date: DateOnlySchema,
  description: Schema.NonEmptyString,
  reference: Schema.String,
});

export type ParsedLine = typeof ParsedLineSchema.Type;

export const FingerprintedLineSchema = Schema.Struct({
  ...ParsedLineSchema.fields,
  fingerprint: FingerprintSchema,
});

export type FingerprintedLine = typeof FingerprintedLineSchema.Type;

export const FileRowSchema = Schema.Struct({
  lineNumber: Schema.Int,
  text: Schema.String,
});

export type FileRow = typeof FileRowSchema.Type;

export interface ParsedBankFile {
  readonly lines: readonly ParsedLine[];
  readonly rejected: readonly RejectedLine[];
}
