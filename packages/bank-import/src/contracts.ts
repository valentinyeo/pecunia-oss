import {
  importBankFileContract,
  listImportTargetsContract,
} from "@pecunia/core/bank-import";

export {
  BankFileRejected,
  ImportAccountNotFound,
  ImportLineRejectionSchema,
  ImportSummarySchema,
  ImportTargetKindSchema,
  ImportTargetSchema,
  ImportUnavailable,
  ProviderAccountIdSchema,
  RejectedLineSchema,
  importBankFileContract,
  listImportTargetsContract,
} from "@pecunia/core/bank-import";

export type {
  ImportLineRejection,
  ImportSummary,
  ImportTarget,
  ImportTargetKind,
  ProviderAccountId,
  RejectedLine,
} from "@pecunia/core/bank-import";

export const bankImportContracts = [
  listImportTargetsContract,
  importBankFileContract,
] as const;
