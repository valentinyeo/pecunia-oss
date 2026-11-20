import { Option, Predicate, Result } from "effect";

import { convertMoney, differenceOf, positionValue, sumOf } from "./exact.js";
import { GainSchema, HoldingValueSchema, TotalSchema } from "./model.js";
import type {
  CurrencyCode,
  ExchangeRate,
  Gain,
  Holding,
  HoldingValue,
  HoldingView,
  InvestmentPlatform,
  Money,
  Portfolio,
  ProfileId,
  RateLookup,
  Total,
  UnknownValueReason,
} from "./model.js";

const compareText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

export const rateLookupOf = (rates: readonly ExchangeRate[]): RateLookup => {
  const ordered = rates.toSorted((left, right) =>
    compareText(right.asOf, left.asOf)
  );

  return (from, to) => {
    const found = ordered.find(
      (rate) => rate.base === from && rate.quote === to
    );

    return found === undefined ? Option.none() : Option.some(found.rate);
  };
};

const gainOf = (
  value: Money,
  costBasis: Option.Option<Money>,
  lookup: RateLookup
): Gain =>
  Option.match(costBasis, {
    onNone: () => GainSchema.cases.Unknown.make({ reason: "no-cost" }),
    onSome: (basis) =>
      Result.match(convertMoney(basis, value.currency, lookup), {
        onFailure: (reason) => GainSchema.cases.Unknown.make({ reason }),
        onSuccess: (converted) =>
          Result.match(differenceOf(value.currency, value, converted), {
            onFailure: (reason) => GainSchema.cases.Unknown.make({ reason }),
            onSuccess: (amount) => GainSchema.cases.Known.make({ amount }),
          }),
      }),
  });

export const unknownValue = (reason: UnknownValueReason): HoldingValue =>
  HoldingValueSchema.cases.Unknown.make({ reason });

export const holdingValue = (
  holding: Holding,
  baseCurrency: CurrencyCode,
  lookup: RateLookup
): HoldingValue =>
  Option.match(holding.lastPrice, {
    onNone: () => unknownValue("no-price"),
    onSome: (price) =>
      holding.state === "pending"
        ? unknownValue("no-price")
        : Result.match(positionValue(holding.quantity, price), {
            onFailure: (reason) => unknownValue(reason),
            onSuccess: (value) =>
              Result.match(convertMoney(value, baseCurrency, lookup), {
                onFailure: (reason) => unknownValue(reason),
                onSuccess: (amount) =>
                  HoldingValueSchema.cases.Known.make({
                    amount,
                    gain: gainOf(amount, holding.costBasis, lookup),
                  }),
              }),
          }),
  });

export const holdingViewOf = (
  holding: Holding,
  baseCurrency: CurrencyCode,
  lookup: RateLookup
): HoldingView => ({
  assetType: holding.assetType,
  costBasis: holding.costBasis,
  holdingId: holding.id,
  name: holding.name,
  openedOn: holding.openedOn,
  platformId: holding.platformId,
  price: holding.state === "pending" ? Option.none() : holding.lastPrice,
  pricedAt: holding.state === "pending" ? Option.none() : holding.pricedAt,
  quantity: holding.quantity,
  state: holding.state,
  symbol: holding.symbol,
  value: holdingValue(holding, baseCurrency, lookup),
});

const knownValues = (views: readonly HoldingView[]): readonly Money[] =>
  views.flatMap((view) =>
    Predicate.isTagged(view.value, "Known") ? [view.value.amount] : []
  );

const totalOf = (values: readonly Money[], currency: CurrencyCode): Total =>
  values.length === 0
    ? TotalSchema.cases.Unknown.make({ reason: "no-value" })
    : Result.match(sumOf(currency, values), {
        onFailure: (reason) => TotalSchema.cases.Unknown.make({ reason }),
        onSuccess: (amount) => TotalSchema.cases.Known.make({ amount }),
      });

const groupOf = (
  platform: InvestmentPlatform,
  views: readonly HoldingView[],
  baseCurrency: CurrencyCode
) => {
  const values = knownValues(views);

  return {
    holdings: views,
    platform,
    total: totalOf(values, baseCurrency),
    unknownCount: views.length - values.length,
  };
};

export interface PortfolioInput {
  readonly baseCurrency: CurrencyCode;
  readonly holdings: readonly Holding[];
  readonly platforms: readonly InvestmentPlatform[];
  readonly profileId: ProfileId;
  readonly rates: readonly ExchangeRate[];
}

export const portfolioOf = (input: PortfolioInput): Portfolio => {
  const lookup = rateLookupOf(input.rates);

  const platformIds = new Set(input.platforms.map((platform) => platform.id));

  const views = input.holdings
    .filter(
      (holding) =>
        holding.profileId === input.profileId &&
        platformIds.has(holding.platformId)
    )
    .map((holding) => holdingViewOf(holding, input.baseCurrency, lookup));

  const platforms = input.platforms.toSorted(
    (left, right) =>
      compareText(left.label, right.label) || compareText(left.id, right.id)
  );

  const groups = platforms.map((platform) =>
    groupOf(
      platform,
      views
        .filter((view) => view.platformId === platform.id)
        .toSorted(
          (left, right) =>
            compareText(left.symbol, right.symbol) ||
            compareText(left.holdingId, right.holdingId)
        ),
      input.baseCurrency
    )
  );

  const values = knownValues(views);

  const portfolio: Portfolio = {
    baseCurrency: input.baseCurrency,
    groups,
    profileId: input.profileId,
    total: totalOf(values, input.baseCurrency),
    unknownCount: views.length - values.length,
    valuedCount: values.length,
  };

  return portfolio;
};
