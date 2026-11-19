import { CurrentPerson } from "@pecunia/access";
import { implement } from "@pecunia/capability/implement";
import { Effect } from "effect";

import {
  addHoldingContract,
  deleteHoldingContract,
  editHoldingContract,
  readInvestmentPortfolioContract,
  refreshInvestmentPricesContract,
  syncInvestmentHoldingsContract,
} from "./contracts.js";
import { readScopeOf, writeScopeOf } from "./scope.js";
import { InvestmentService } from "./service.js";

export const readInvestmentPortfolio = implement(
  readInvestmentPortfolioContract,
  ({ profileId }) =>
    Effect.gen(function* readProfilePortfolio() {
      const person = yield* CurrentPerson;

      const scope = yield* readScopeOf(person, profileId);

      const service = yield* InvestmentService;

      return yield* service.portfolio(scope);
    })
);

export const addHolding = implement(
  addHoldingContract,
  ({ profileId, ...holding }) =>
    Effect.gen(function* addProfileHolding() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvestmentService;

      return yield* service.add(scope, holding);
    })
);

export const editHolding = implement(
  editHoldingContract,
  ({ profileId, ...patch }) =>
    Effect.gen(function* editProfileHolding() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvestmentService;

      return yield* service.edit(scope, patch);
    })
);

export const deleteHolding = implement(
  deleteHoldingContract,
  ({ holdingId, profileId }) =>
    Effect.gen(function* deleteProfileHolding() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvestmentService;

      return yield* service.remove(scope, holdingId);
    })
);

export const syncInvestmentHoldings = implement(
  syncInvestmentHoldingsContract,
  ({ accountId, platformId, profileId }) =>
    Effect.gen(function* syncProfileHoldings() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvestmentService;

      return yield* service.sync(scope, { accountId, platformId });
    })
);

export const refreshInvestmentPrices = implement(
  refreshInvestmentPricesContract,
  ({ profileId }) =>
    Effect.gen(function* refreshProfilePrices() {
      const person = yield* CurrentPerson;

      const scope = yield* writeScopeOf(person, profileId);

      const service = yield* InvestmentService;

      return yield* service.refreshPrices(scope);
    })
);

export const investmentCapabilities = [
  readInvestmentPortfolio,
  addHolding,
  editHolding,
  deleteHolding,
  syncInvestmentHoldings,
  refreshInvestmentPrices,
] as const;
