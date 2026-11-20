import { orderBankLines } from "@pecunia/bank-lines";
import type { BankLine } from "@pecunia/bank-lines";
import { demoBankLines } from "@pecunia/bank-lines/demo";
import { BankLineIdSchema } from "@pecunia/bank-lines/model";
import type { BankLineId } from "@pecunia/bank-lines/model";
import { Option, Predicate, Schema } from "effect";

import { demoCatalogue } from "../src/client/pecunia/catalogue.js";

export const demoLines: readonly BankLine[] = orderBankLines(demoBankLines);

export const uncategorisedLines: readonly BankLine[] = demoLines.filter(
  (line) => Option.isNone(line.category)
);

export const awaitingLines: readonly BankLine[] = demoLines.filter((line) =>
  Predicate.isTagged(line.review, "Awaiting")
);

export const categoryIdOf = (name: string) => {
  const found = demoCatalogue.find((choice) => choice.name === name);

  if (found === undefined) {
    throw new Error(`The demo catalogue has no category named ${name}`);
  }

  return found.id;
};

export const lineWithMerchant = (merchant: string): BankLine => {
  const found = demoLines.find((line) => line.raw.merchant === merchant);

  if (found === undefined) {
    throw new Error(`The demo book has no line for ${merchant}`);
  }

  return found;
};

export const lineIdOf = (line: BankLine): BankLineId =>
  Schema.decodeSync(BankLineIdSchema)(line.id);
