import { Match, Option, Schema } from "effect";

import { HoldingSchema } from "./model.js";
import type {
  CostBasisChange,
  Holding,
  HoldingPatch,
  Money,
  NameChange,
  PriceChange,
  Quantity,
  QuantityChange,
} from "./model.js";

const applyCostBasis = (
  holding: Holding,
  change: CostBasisChange
): Option.Option<Money> =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => holding.costBasis),
    Match.tag("Cleared", () => Option.none()),
    Match.tag("Set", ({ costBasis }) => Option.some(costBasis)),
    Match.exhaustive
  );

const applyName = (holding: Holding, change: NameChange): string =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => holding.name),
    Match.tag("Set", ({ name }) => name),
    Match.exhaustive
  );

const applyQuantity = (holding: Holding, change: QuantityChange): Quantity =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => holding.quantity),
    Match.tag("Set", ({ quantity }) => quantity),
    Match.exhaustive
  );

const applyPrice = (
  holding: Holding,
  change: PriceChange
): Pick<Holding, "lastPrice" | "pricedAt" | "state"> =>
  Match.value(change).pipe(
    Match.tag("Unchanged", () => ({
      lastPrice: holding.lastPrice,
      pricedAt: holding.pricedAt,
      state: holding.state,
    })),
    Match.tag("Cleared", () => ({
      lastPrice: Option.none(),
      pricedAt: Option.none(),
      state: holding.state,
    })),
    Match.tag("Set", ({ price, pricedAt }) => ({
      lastPrice: Option.some(price),
      pricedAt: Option.some(pricedAt),
      state: holding.state === "pending" ? ("active" as const) : holding.state,
    })),
    Match.exhaustive
  );

export const applyHoldingPatch = (
  holding: Holding,
  patch: HoldingPatch
): Holding => {
  const price = applyPrice(holding, patch.price);

  return Schema.decodeSync(HoldingSchema)({
    assetType: holding.assetType,
    costBasis: Option.getOrNull(applyCostBasis(holding, patch.costBasis)),
    currency: holding.currency,
    id: holding.id,
    lastPrice: Option.getOrNull(price.lastPrice),
    name: applyName(holding, patch.name),
    openedOn: holding.openedOn,
    platformId: holding.platformId,
    pricedAt: Option.getOrNull(price.pricedAt),
    profileId: holding.profileId,
    quantity: applyQuantity(holding, patch.quantity),
    state: price.state,
    symbol: holding.symbol,
  });
};
