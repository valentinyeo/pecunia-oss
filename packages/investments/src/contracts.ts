import { Forbidden } from "@pecunia/access";
import { defineContract } from "@pecunia/capability/contract";
import { UnknownProfile } from "@pecunia/core/settings";
import { Schema } from "effect";

import { BrokerPayloadRejected } from "./broker-payload-rejected.js";
import { BrokerUnavailable } from "./broker-unavailable.js";
import { DuplicateHolding } from "./duplicate-holding.js";
import { InvestmentsUnavailable } from "./investments-unavailable.js";
import { MismatchedProfile } from "./mismatched-profile.js";
import {
  AddHoldingRequestSchema,
  DeleteHoldingRequestSchema,
  EditHoldingRequestSchema,
  HoldingSchema,
  PortfolioSchema,
  PriceRefreshSummarySchema,
  ReadPortfolioRequestSchema,
  RefreshPricesRequestSchema,
  SyncHoldingsRequestSchema,
  SyncSummarySchema,
} from "./model.js";
import { UnknownHolding } from "./unknown-holding.js";
import { UnknownPlatform } from "./unknown-platform.js";

export const readInvestmentPortfolioContract = defineContract(
  "readInvestmentPortfolio",
  {
    annotations: { idempotent: true, readOnly: true },
    description:
      "Read a profile's holdings grouped by investment platform, valued in the profile's base currency. Each holding carries its quantity in millionths of a unit and a value that is either known or unknown by name: no price yet, no exchange rate, or an amount outside the exact integer range. An unknown value is never zero. A holding's gain is known only when it has both a price and a cost basis. The total adds the known values only and counts the unknown ones separately.",
    failure: Schema.Union([
      InvestmentsUnavailable,
      Forbidden,
      UnknownProfile,
      UnknownPlatform,
    ]),
    input: ReadPortfolioRequestSchema,
    output: PortfolioSchema,
  }
);

export const addHoldingContract = defineContract("addHolding", {
  annotations: { idempotent: false },
  description:
    "Add one holding to a profile by hand. Quantity is millionths of a unit, money is integer minor units with a currency, and a price is paired with the instant it was priced. A holding added without a price shows an unknown value. A symbol can appear once per platform per profile.",
  failure: Schema.Union([
    InvestmentsUnavailable,
    DuplicateHolding,
    Forbidden,
    MismatchedProfile,
    UnknownPlatform,
  ]),
  input: AddHoldingRequestSchema,
  output: HoldingSchema,
});

export const editHoldingContract = defineContract("editHolding", {
  annotations: { idempotent: true },
  description:
    "Edit one holding's name, quantity, cost basis and price. Every field is an explicit change, so leaving it alone, clearing it and setting it are different values. Pricing a pending holding marks it active. The store applies the patch to the holding as it stands, so a concurrent edit to another field survives.",
  failure: Schema.Union([InvestmentsUnavailable, Forbidden, UnknownHolding]),
  input: EditHoldingRequestSchema,
  output: HoldingSchema,
});

export const deleteHoldingContract = defineContract("deleteHolding", {
  annotations: { destructive: true, idempotent: false },
  description:
    "Delete one holding from a profile. The deleted holding is returned so the caller can show what left the book. Deleting a holding that is already gone fails by name.",
  failure: Schema.Union([InvestmentsUnavailable, Forbidden, UnknownHolding]),
  input: DeleteHoldingRequestSchema,
  output: HoldingSchema,
});

export const syncInvestmentHoldingsContract = defineContract(
  "syncInvestmentHoldings",
  {
    annotations: { idempotent: true },
    description:
      "Start the broker holdings sync for one provider account and one investment platform. The broker's own API supplies each symbol, quantity and price; the sync creates holdings it has not seen and updates the ones it has, keeping the last known price when the broker returns no quote. A holding without a price is counted as unpriced rather than valued at zero.",
    failure: Schema.Union([
      BrokerPayloadRejected,
      BrokerUnavailable,
      Forbidden,
      InvestmentsUnavailable,
      MismatchedProfile,
      UnknownPlatform,
    ]),
    input: SyncHoldingsRequestSchema,
    output: SyncSummarySchema,
  }
);

export const refreshInvestmentPricesContract = defineContract(
  "refreshInvestmentPrices",
  {
    annotations: { idempotent: true },
    description:
      "Refresh the last price of every active and closed holding from its asset type's price source: shares, funds, ETFs, cash and any other asset use the market source, and crypto uses the second crypto source. A symbol with no quote stays unpriced and is counted, never zero. Pending holdings are left alone.",
    failure: Schema.Union([Forbidden, InvestmentsUnavailable]),
    input: RefreshPricesRequestSchema,
    output: PriceRefreshSummarySchema,
  }
);

export const investmentContracts = [
  readInvestmentPortfolioContract,
  addHoldingContract,
  editHoldingContract,
  deleteHoldingContract,
  syncInvestmentHoldingsContract,
  refreshInvestmentPricesContract,
] as const;
