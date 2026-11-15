import { Option, Schema } from "effect";

import {
  CurrencyCodeSchema,
  DateOnlySchema,
  HoldingIdSchema,
  MoneySchema,
  PlatformIdSchema,
  ProfileIdSchema,
  QuantitySchema,
  TimestampSchema,
} from "./primitives.js";
import type { Money, Timestamp } from "./primitives.js";

export const InvestmentPlatformSchema = Schema.Struct({
  connector: Schema.Literals(["manual", "trading212"]),
  enabled: Schema.Boolean,
  id: PlatformIdSchema,
  label: Schema.NonEmptyString,
});

export type InvestmentPlatform = typeof InvestmentPlatformSchema.Type;

export const AssetTypeSchema = Schema.Literals([
  "cash",
  "crypto",
  "etf",
  "fund",
  "stock",
]);

export type AssetType = typeof AssetTypeSchema.Type;

interface PricedHolding {
  readonly lastPrice: Option.Option<Money>;
  readonly pricedAt: Option.Option<Timestamp>;
  readonly state: "active" | "closed" | "pending";
}

const pendingHasNoPrice = Schema.makeFilter<PricedHolding>(
  (holding) =>
    holding.state !== "pending" ||
    (Option.isNone(holding.lastPrice) && Option.isNone(holding.pricedAt)),
  { expected: "no market price on a pending holding" }
);

export const HoldingSchema = Schema.Struct({
  assetType: AssetTypeSchema,
  costBasis: Schema.OptionFromNullishOr(MoneySchema),
  currency: CurrencyCodeSchema,
  id: HoldingIdSchema,
  lastPrice: Schema.OptionFromNullishOr(MoneySchema),
  name: Schema.NonEmptyString,
  openedOn: DateOnlySchema,
  platformId: PlatformIdSchema,
  pricedAt: Schema.OptionFromNullishOr(TimestampSchema),
  profileId: ProfileIdSchema,
  quantity: QuantitySchema,
  state: Schema.Literals(["active", "closed", "pending"]),
  symbol: Schema.NonEmptyString,
}).check(pendingHasNoPrice);

export type Holding = typeof HoldingSchema.Type;
