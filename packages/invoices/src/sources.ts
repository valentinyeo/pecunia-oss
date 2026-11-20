import { Option } from "effect";

import type { InvoiceSource } from "./model.js";

const narrow = (text: string): string => text.trim().toLowerCase();

export const matchesMerchant = (pattern: string, merchant: string): boolean => {
  const needle = narrow(pattern);

  return needle.length > 0 && narrow(merchant).includes(needle);
};

const byId = (left: InvoiceSource, right: InvoiceSource): number => {
  if (left.id === right.id) {
    return 0;
  }

  return left.id < right.id ? -1 : 1;
};

export const sourceFor = (
  merchant: string,
  sources: readonly InvoiceSource[]
): Option.Option<InvoiceSource> =>
  Option.fromUndefinedOr(
    sources
      .filter((source) => matchesMerchant(source.pattern, merchant))
      .toSorted(byId)[0]
  );
