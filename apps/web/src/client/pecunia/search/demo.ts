import { demoBankLines } from "@pecunia/bank-lines/demo";
import { demoPortfolio } from "@pecunia/investments/demo";

import type { SearchHoldingValue } from "./model.js";

export const demoHoldings: readonly SearchHoldingValue[] =
  demoPortfolio.groups.flatMap((group) =>
    group.holdings.map((holding) => ({
      holdingId: holding.holdingId,
      name: holding.name,
      value: holding.value,
    }))
  );

export const demoMerchants: readonly string[] = [
  ...new Set(
    demoBankLines.flatMap((line) =>
      line.raw.merchant === "" ? [] : [line.raw.merchant]
    )
  ),
].toSorted();
