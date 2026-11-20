import { convertMinor } from "@pecunia/core/model";
import { Option, Predicate, Result, Schema } from "effect";

import {
  GainSchema,
  HoldingValueSchema,
  MoneySchema,
  TotalSchema,
} from "./model.js";
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
  Quantity,
  RateLookup,
  Total,
  UnknownValueReason,
} from "./model.js";

const QUANTITY_SCALE = 1_000_000n;

const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

const compareText = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};

const roundHalfAwayFromZero = (
  numerator: bigint,
  denominator: bigint
): bigint => {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const doubled = (remainder < 0n ? -remainder : remainder) * 2n;

  return doubled >= denominator
    ? quotient + (numerator < 0n ? -1n : 1n)
    : quotient;
};

export const safeMoney = (
  currency: CurrencyCode,
  minor: bigint
): Option.Option<Money> =>
  minor >= MIN_SAFE && minor <= MAX_SAFE
    ? Schema.decodeOption(MoneySchema)({ currency, minor: Number(minor) })
    : Option.none();

export const positionValue = (
  quantity: Quantity,
  price: Money
): Option.Option<Money> =>
  safeMoney(
    price.currency,
    roundHalfAwayFromZero(
      BigInt(quantity) * BigInt(price.minor),
      QUANTITY_SCALE
    )
  );

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

export const convertMoney = (
  money: Money,
  to: CurrencyCode,
  lookup: RateLookup
): Result.Result<Money, "no-rate" | "out-of-range"> => {
  if (money.currency === to) {
    return Result.succeed(money);
  }

  return Option.match(lookup(money.currency, to), {
    onNone: () => Result.fail("no-rate"),
    onSome: (rate) =>
      Result.match(convertMinor(money.minor, money.currency, to, rate), {
        onFailure: () => Result.fail("out-of-range"),
        onSuccess: (minor) =>
          Option.match(safeMoney(to, BigInt(minor)), {
            onNone: () => Result.fail("out-of-range"),
            onSome: (amount) => Result.succeed(amount),
          }),
      }),
  });
};

const gainOf = (
  value: Money,
  costBasis: Option.Option<Money>,
  lookup: RateLookup
): Gain => {
  if (Option.isNone(costBasis)) {
    return GainSchema.cases.Unknown.make({ reason: "no-cost-basis" });
  }

  return Result.match(convertMoney(costBasis.value, value.currency, lookup), {
    onFailure: (reason) => GainSchema.cases.Unknown.make({ reason }),
    onSuccess: (converted) =>
      Option.match(
        safeMoney(
          value.currency,
          BigInt(value.minor) - BigInt(converted.minor)
        ),
        {
          onNone: () =>
            GainSchema.cases.Unknown.make({ reason: "out-of-range" }),
          onSome: (amount) => GainSchema.cases.Known.make({ amount }),
        }
      ),
  });
};

export const unknownValue = (reason: UnknownValueReason): HoldingValue =>
  HoldingValueSchema.cases.Unknown.make({ reason });

export const holdingValue = (
  holding: Holding,
  baseCurrency: CurrencyCode,
  lookup: RateLookup
): HoldingValue => {
  if (holding.state === "pending" || Option.isNone(holding.lastPrice)) {
    return unknownValue("no-price");
  }

  const value = positionValue(holding.quantity, holding.lastPrice.value);

  if (Option.isNone(value)) {
    return unknownValue("out-of-range");
  }

  return Result.match(convertMoney(value.value, baseCurrency, lookup), {
    onFailure: (reason) => unknownValue(reason),
    onSuccess: (amount) =>
      HoldingValueSchema.cases.Known.make({
        amount,
        gain: gainOf(amount, holding.costBasis, lookup),
      }),
  });
};

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

const totalOf = (values: readonly Money[], currency: CurrencyCode): Total => {
  if (values.length === 0) {
    return TotalSchema.cases.Unknown.make({ reason: "no-value" });
  }

  let total = 0n;

  for (const value of values) {
    total += BigInt(value.minor);
  }

  return Option.match(safeMoney(currency, total), {
    onNone: () => TotalSchema.cases.Unknown.make({ reason: "out-of-range" }),
    onSome: (amount) => TotalSchema.cases.Known.make({ amount }),
  });
};

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
