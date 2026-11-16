import { defineContract } from "@pecunia/capability/contract";
import { Schema } from "effect";

import { BankFileRejected } from "./bank-file-rejected.js";
import { ImportAccountNotFound } from "./import-account-not-found.js";
import { ImportUnavailable } from "./import-unavailable.js";
import { CurrencyCodeSchema, ProfileIdSchema } from "./settings.js";

export { BankFileRejected } from "./bank-file-rejected.js";

export { ImportAccountNotFound } from "./import-account-not-found.js";

export { ImportUnavailable } from "./import-unavailable.js";

export const ProviderAccountIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("ProviderAccountId")
);

export type ProviderAccountId = typeof ProviderAccountIdSchema.Type;

export const ImportTargetKindSchema = Schema.Literals(["bank", "csv"]);

export type ImportTargetKind = typeof ImportTargetKindSchema.Type;

export const ImportTargetSchema = Schema.Struct({
  baseCurrency: CurrencyCodeSchema,
  id: ProviderAccountIdSchema,
  kind: ImportTargetKindSchema,
  label: Schema.NonEmptyString,
  profileId: ProfileIdSchema,
  providerLabel: Schema.NonEmptyString,
});

export type ImportTarget = typeof ImportTargetSchema.Type;

export const ImportLineRejectionSchema = Schema.Literals([
  "bad-amount",
  "bad-currency",
  "bad-date",
  "blank-description",
  "field-count",
  "foreign-currency",
  "non-printable",
  "over-long",
]);

export type ImportLineRejection = typeof ImportLineRejectionSchema.Type;

export const RejectedLineSchema = Schema.Struct({
  lineNumber: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  reason: ImportLineRejectionSchema,
  text: Schema.String.check(Schema.isMaxLength(200)),
});

export type RejectedLine = typeof RejectedLineSchema.Type;

export const ImportSummarySchema = Schema.Struct({
  alreadyImported: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  fileName: Schema.NonEmptyString,
  imported: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  rejected: Schema.Array(RejectedLineSchema),
});

export type ImportSummary = typeof ImportSummarySchema.Type;

export const MAXIMUM_BANK_FILE_BYTES = 4_194_304;

export const listImportTargetsContract = defineContract("listImportTargets", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List the bank and CSV accounts a profile can import a file into, with each account's base currency.",
  failure: ImportUnavailable,
  input: Schema.Struct({ profileId: ProfileIdSchema }),
  output: Schema.Array(ImportTargetSchema),
});

export const importBankFileContract = defineContract("importBankFile", {
  annotations: { idempotent: true },
  description:
    "Import a bank CSV file into one account, keeping every distinct line once by its fingerprint.",
  failure: Schema.Union([
    BankFileRejected,
    ImportAccountNotFound,
    ImportUnavailable,
  ]),
  input: Schema.Struct({
    accountId: ProviderAccountIdSchema,
    content: Schema.String.check(Schema.isMaxLength(MAXIMUM_BANK_FILE_BYTES)),
    fileName: Schema.NonEmptyString,
    profileId: ProfileIdSchema,
  }),
  output: ImportSummarySchema,
});
