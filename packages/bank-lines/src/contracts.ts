import { Forbidden } from "@pecunia/access";
import { defineContract } from "@pecunia/capability/contract";
import { Schema } from "effect";

import { BankLineStoreError } from "./bank-line-store-error.js";
import {
  BankLinePageSchema,
  BankLineSchema,
  EditBankLineRequestSchema,
  ListBankLinesRequestSchema,
  ReviewBankLineRequestSchema,
} from "./model.js";
import { UnknownBankLine } from "./unknown-bank-line.js";
import { UnknownCategory } from "./unknown-category.js";

export const listBankLinesContract = defineContract("listBankLines", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List a profile's bank lines newest first, with a keyset cursor. Filters cover account, direction, amount in one currency, category, review state and the occurred range. Search matches merchant, description, reference and note text, ignoring case. Amounts are integer minor units.",
  failure: Schema.Union([BankLineStoreError, Forbidden]),
  input: ListBankLinesRequestSchema,
  output: BankLinePageSchema,
});

export const editBankLineContract = defineContract("editBankLine", {
  annotations: { idempotent: true },
  description:
    "Edit one bank line's category and note. Category and note are explicit changes, so an absent edit is impossible. A cleared category removes it, and an assigned category must be live in the same profile.",
  failure: Schema.Union([
    BankLineStoreError,
    Forbidden,
    UnknownBankLine,
    UnknownCategory,
  ]),
  input: EditBankLineRequestSchema,
  output: BankLineSchema,
});

export const reviewBankLineContract = defineContract("reviewBankLine", {
  annotations: { idempotent: true },
  description:
    "Mark one bank line reviewed. Reviewing an already reviewed line keeps the first review time.",
  failure: Schema.Union([BankLineStoreError, Forbidden, UnknownBankLine]),
  input: ReviewBankLineRequestSchema,
  output: BankLineSchema,
});

export const bankLineContracts = [
  listBankLinesContract,
  editBankLineContract,
  reviewBankLineContract,
] as const;
