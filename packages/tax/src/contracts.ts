import { Forbidden } from "@pecunia/access";
import { defineContract } from "@pecunia/capability/contract";
import { Schema } from "effect";

import {
  ListTaxDuesRequestSchema,
  SyncReceiptSchema,
  SyncTaxDuesRequestSchema,
  TaxDuesSchema,
} from "./model.js";
import { TaxBooksUnavailable } from "./tax-books-unavailable.js";
import { TaxDuesRejected } from "./tax-due-rejected.js";
import { TaxDueStoreError } from "./tax-due-store-error.js";
import { UnknownTaxProfile } from "./unknown-tax-profile.js";

export const listTaxDuesContract = defineContract("listTaxDues", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "List a profile's Self Assessment payments due and every other stored tax due, soonest due date first, with the tax profiles they belong to. Every due is stored as data for one profile and one tax profile, and every kind is listed. Amounts are integer minor units of the due's own currency.",
  failure: Schema.Union([Forbidden, TaxDueStoreError]),
  input: ListTaxDuesRequestSchema,
  output: TaxDuesSchema,
});

export const syncTaxDuesContract = defineContract("syncTaxDues", {
  annotations: { idempotent: true },
  description:
    "Fetch the Self Assessment payments due for one tax profile from its books tool (FreeAgent today) and replace only the stored rows of the kinds it reports: a payment that is still upstream keeps its row, a changed amount is updated, and a payment that disappeared upstream is removed. A row of another kind on the same tax profile is left untouched and is counted in neither inserted nor removed. The stored set only changes when the books tool answers cleanly, so an outage never empties the list.",
  failure: Schema.Union([
    Forbidden,
    TaxBooksUnavailable,
    TaxDueStoreError,
    TaxDuesRejected,
    UnknownTaxProfile,
  ]),
  input: SyncTaxDuesRequestSchema,
  output: SyncReceiptSchema,
});

export const taxDueContracts = [
  listTaxDuesContract,
  syncTaxDuesContract,
] as const;
