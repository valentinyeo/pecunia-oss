import type { BankLine } from "@pecunia/bank-lines/model";

import { formatMoney } from "./money-format.js";

const signOf = (line: BankLine): string => {
  if (line.direction === "out") {
    return "−";
  }

  return line.direction === "in" ? "+" : "";
};

export const signedAmount = (line: BankLine): string =>
  `${signOf(line)}${formatMoney({
    currency: line.amount.currency,
    minor: line.amount.minor,
  })}`;
