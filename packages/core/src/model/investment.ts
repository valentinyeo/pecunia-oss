import { Option, Schema, SchemaGetter } from "effect";

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

const HoldingFields = {
  assetType: AssetTypeSchema,
  costBasis: Schema.OptionFromNullishOr(MoneySchema),
  currency: CurrencyCodeSchema,
  id: HoldingIdSchema,
  name: Schema.NonEmptyString,
  openedOn: DateOnlySchema,
  platformId: PlatformIdSchema,
  profileId: ProfileIdSchema,
  quantity: QuantitySchema,
  symbol: Schema.NonEmptyString,
} as const;

const StoredHoldingSchema = Schema.Struct({
  ...HoldingFields,
  lastPrice: Schema.OptionFromNullishOr(MoneySchema),
  pricedAt: Schema.OptionFromNullishOr(TimestampSchema),
  state: Schema.Literals(["active", "closed", "pending"]),
});

type StoredHolding = typeof StoredHoldingSchema.Type;

export const PendingHoldingSchema = Schema.Struct({
  ...HoldingFields,
  lastPrice: Schema.OptionFromNullishOr(Schema.Never),
  pricedAt: Schema.OptionFromNullishOr(Schema.Never),
  state: Schema.Literals(["pending"]),
});

export const PricedHoldingSchema = Schema.Struct({
  ...HoldingFields,
  lastPrice: Schema.OptionFromNullishOr(MoneySchema),
  pricedAt: Schema.OptionFromNullishOr(TimestampSchema),
  state: Schema.Literals(["active", "closed"]),
});

const DecodedHoldingSchema = Schema.Union([
  PendingHoldingSchema,
  PricedHoldingSchema,
]);

type EncodedHolding = typeof DecodedHoldingSchema.Encoded;

const decodedFields = (holding: StoredHolding) => ({
  assetType: holding.assetType,
  costBasis: Option.getOrNull(holding.costBasis),
  currency: holding.currency,
  id: holding.id,
  name: holding.name,
  openedOn: holding.openedOn,
  platformId: holding.platformId,
  profileId: holding.profileId,
  quantity: holding.quantity,
  symbol: holding.symbol,
});

const decodedHolding = (
  holding: StoredHolding
): Option.Option<EncodedHolding> => {
  const fields = decodedFields(holding);

  if (holding.state !== "pending") {
    return Option.some({
      ...fields,
      lastPrice: Option.getOrNull(holding.lastPrice),
      pricedAt: Option.getOrNull(holding.pricedAt),
      state: holding.state,
    });
  }

  if (Option.isSome(holding.lastPrice) || Option.isSome(holding.pricedAt)) {
    return Option.none();
  }

  return Option.some({
    ...fields,
    lastPrice: null,
    pricedAt: null,
    state: "pending",
  });
};

const encodedHolding = (holding: EncodedHolding): StoredHolding =>
  Schema.decodeSync(StoredHoldingSchema)({
    ...holding,
    costBasis: holding.costBasis ?? null,
    lastPrice: holding.lastPrice ?? null,
    pricedAt: holding.pricedAt ?? null,
    state: holding.state,
  });

export const HoldingSchema = StoredHoldingSchema.pipe(
  Schema.decodeTo(DecodedHoldingSchema, {
    decode: SchemaGetter.transformOptional((stored) =>
      stored.pipe(Option.flatMap(decodedHolding))
    ),
    encode: SchemaGetter.transform(encodedHolding),
  })
);

export type Holding = typeof HoldingSchema.Type;
