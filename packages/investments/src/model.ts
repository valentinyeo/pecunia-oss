import {
  AssetTypeSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  ExchangeRateSchema,
  HoldingIdSchema,
  HoldingSchema,
  InvestmentPlatformSchema,
  MoneySchema,
  PlatformIdSchema,
  ProfileIdSchema,
  QuantitySchema,
  RateSchema,
  TimestampSchema,
} from "@pecunia/core/model";
import type {
  AssetType,
  CurrencyCode,
  DateOnly,
  ExchangeRate,
  Holding,
  HoldingId,
  InvestmentPlatform,
  MinorUnits,
  Money,
  PlatformId,
  ProfileId,
  Quantity,
  Rate,
  Timestamp,
} from "@pecunia/core/model";
import { Option, Schema } from "effect";

export {
  AssetTypeSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  ExchangeRateSchema,
  HoldingIdSchema,
  HoldingSchema,
  InvestmentPlatformSchema,
  MoneySchema,
  PlatformIdSchema,
  ProfileIdSchema,
  QuantitySchema,
  RateSchema,
  TimestampSchema,
};

export type {
  AssetType,
  CurrencyCode,
  DateOnly,
  ExchangeRate,
  Holding,
  HoldingId,
  InvestmentPlatform,
  MinorUnits,
  Money,
  PlatformId,
  ProfileId,
  Quantity,
  Rate,
  Timestamp,
};

export const HoldingStateSchema = Schema.Literals([
  "active",
  "closed",
  "pending",
]);

export type HoldingState = typeof HoldingStateSchema.Type;

export const ManualHoldingStateSchema = Schema.Literals(["active", "closed"]);

export type ManualHoldingState = typeof ManualHoldingStateSchema.Type;

export const BROKER_ACCOUNT_ID_MAX_LENGTH = 64;

export const BrokerAccountIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(BROKER_ACCOUNT_ID_MAX_LENGTH)
).pipe(Schema.brand("BrokerAccountId"));

export type BrokerAccountId = typeof BrokerAccountIdSchema.Type;

export const SYMBOL_MAX_LENGTH = 64;

export const HoldingSymbolSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(SYMBOL_MAX_LENGTH)
);

export type HoldingSymbol = typeof HoldingSymbolSchema.Type;

export const HOLDING_NAME_MAX_LENGTH = 120;

export const HoldingNameSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(HOLDING_NAME_MAX_LENGTH)
);

export type HoldingName = typeof HoldingNameSchema.Type;

export const UnknownValueReasonSchema = Schema.Literals([
  "no-price",
  "no-rate",
  "out-of-range",
]);

export type UnknownValueReason = typeof UnknownValueReasonSchema.Type;

export const UnknownGainReasonSchema = Schema.Literals([
  "no-cost-basis",
  "no-rate",
  "out-of-range",
]);

export type UnknownGainReason = typeof UnknownGainReasonSchema.Type;

export const GainSchema = Schema.TaggedUnion({
  Known: { amount: MoneySchema },
  Unknown: { reason: UnknownGainReasonSchema },
});

export type Gain = typeof GainSchema.Type;

export const HoldingValueSchema = Schema.TaggedUnion({
  Known: { amount: MoneySchema, gain: GainSchema },
  Unknown: { reason: UnknownValueReasonSchema },
});

export type HoldingValue = typeof HoldingValueSchema.Type;

export const HoldingViewSchema = Schema.Struct({
  assetType: AssetTypeSchema,
  costBasis: Schema.OptionFromNullishOr(MoneySchema),
  holdingId: HoldingIdSchema,
  name: HoldingNameSchema,
  openedOn: DateOnlySchema,
  platformId: PlatformIdSchema,
  price: Schema.OptionFromNullishOr(MoneySchema),
  pricedAt: Schema.OptionFromNullishOr(TimestampSchema),
  quantity: QuantitySchema,
  state: HoldingStateSchema,
  symbol: HoldingSymbolSchema,
  value: HoldingValueSchema,
});

export type HoldingView = typeof HoldingViewSchema.Type;

export const PlatformGroupSchema = Schema.Struct({
  holdings: Schema.Array(HoldingViewSchema),
  platform: InvestmentPlatformSchema,
  total: Schema.OptionFromNullishOr(MoneySchema),
  unknownCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type PlatformGroup = typeof PlatformGroupSchema.Type;

export const PortfolioSchema = Schema.Struct({
  baseCurrency: CurrencyCodeSchema,
  groups: Schema.Array(PlatformGroupSchema),
  profileId: ProfileIdSchema,
  total: Schema.OptionFromNullishOr(MoneySchema),
  unknownCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  valuedCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type Portfolio = typeof PortfolioSchema.Type;

export const ReadPortfolioRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type ReadPortfolioRequest = typeof ReadPortfolioRequestSchema.Type;

const priceIsPair = (holding: {
  readonly price: Option.Option<Money>;
  readonly pricedAt: Option.Option<Timestamp>;
}) => Option.isSome(holding.price) === Option.isSome(holding.pricedAt);

export const NewHoldingSchema = Schema.Struct({
  assetType: AssetTypeSchema,
  costBasis: Schema.OptionFromNullishOr(MoneySchema),
  currency: CurrencyCodeSchema,
  name: HoldingNameSchema,
  openedOn: DateOnlySchema,
  platformId: PlatformIdSchema,
  price: Schema.OptionFromNullishOr(MoneySchema),
  pricedAt: Schema.OptionFromNullishOr(TimestampSchema),
  quantity: QuantitySchema,
  state: ManualHoldingStateSchema,
  symbol: HoldingSymbolSchema,
}).check(
  Schema.makeFilter(priceIsPair, {
    expected: "a price and the instant it was priced, or neither",
  })
);

export type NewHolding = typeof NewHoldingSchema.Type;

export const AddHoldingRequestSchema = Schema.Struct({
  ...NewHoldingSchema.fields,
  profileId: ProfileIdSchema,
}).check(
  Schema.makeFilter(priceIsPair, {
    expected: "a price and the instant it was priced, or neither",
  })
);

export type AddHoldingRequest = typeof AddHoldingRequestSchema.Type;

export const QuantityChangeSchema = Schema.TaggedUnion({
  Set: { quantity: QuantitySchema },
  Unchanged: {},
});

export type QuantityChange = typeof QuantityChangeSchema.Type;

export const NameChangeSchema = Schema.TaggedUnion({
  Set: { name: HoldingNameSchema },
  Unchanged: {},
});

export type NameChange = typeof NameChangeSchema.Type;

export const CostBasisChangeSchema = Schema.TaggedUnion({
  Cleared: {},
  Set: { costBasis: MoneySchema },
  Unchanged: {},
});

export type CostBasisChange = typeof CostBasisChangeSchema.Type;

export const PriceChangeSchema = Schema.TaggedUnion({
  Cleared: {},
  Set: { price: MoneySchema, pricedAt: TimestampSchema },
  Unchanged: {},
});

export type PriceChange = typeof PriceChangeSchema.Type;

export const HoldingPatchSchema = Schema.Struct({
  costBasis: CostBasisChangeSchema,
  holdingId: HoldingIdSchema,
  name: NameChangeSchema,
  price: PriceChangeSchema,
  quantity: QuantityChangeSchema,
});

export type HoldingPatch = typeof HoldingPatchSchema.Type;

export const EditHoldingRequestSchema = Schema.Struct({
  ...HoldingPatchSchema.fields,
  profileId: ProfileIdSchema,
});

export type EditHoldingRequest = typeof EditHoldingRequestSchema.Type;

export const HoldingRefSchema = Schema.Struct({
  holdingId: HoldingIdSchema,
});

export type HoldingRef = typeof HoldingRefSchema.Type;

export const DeleteHoldingRequestSchema = Schema.Struct({
  ...HoldingRefSchema.fields,
  profileId: ProfileIdSchema,
});

export type DeleteHoldingRequest = typeof DeleteHoldingRequestSchema.Type;

export const SyncHoldingsSchema = Schema.Struct({
  accountId: BrokerAccountIdSchema,
  platformId: PlatformIdSchema,
});

export type SyncHoldings = typeof SyncHoldingsSchema.Type;

export const SyncHoldingsRequestSchema = Schema.Struct({
  ...SyncHoldingsSchema.fields,
  profileId: ProfileIdSchema,
});

export type SyncHoldingsRequest = typeof SyncHoldingsRequestSchema.Type;

export const SyncSummarySchema = Schema.Struct({
  created: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  unpriced: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  updated: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type SyncSummary = typeof SyncSummarySchema.Type;

export const RefreshPricesRequestSchema = Schema.Struct({
  profileId: ProfileIdSchema,
});

export type RefreshPricesRequest = typeof RefreshPricesRequestSchema.Type;

export const PriceRefreshSummarySchema = Schema.Struct({
  priced: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  unpriced: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

export type PriceRefreshSummary = typeof PriceRefreshSummarySchema.Type;

export const BrokerHoldingSchema = Schema.Struct({
  assetType: AssetTypeSchema,
  costBasis: Schema.OptionFromNullishOr(MoneySchema),
  currency: CurrencyCodeSchema,
  name: HoldingNameSchema,
  openedOn: DateOnlySchema,
  price: Schema.OptionFromNullishOr(MoneySchema),
  pricedAt: Schema.OptionFromNullishOr(TimestampSchema),
  quantity: QuantitySchema,
  symbol: HoldingSymbolSchema,
});

export type BrokerHolding = typeof BrokerHoldingSchema.Type;

export const QuoteSourceSchema = Schema.Literals(["market", "crypto"]);

export type QuoteSource = typeof QuoteSourceSchema.Type;

export const QuoteSchema = Schema.Struct({
  asOf: TimestampSchema,
  price: MoneySchema,
  source: QuoteSourceSchema,
  symbol: HoldingSymbolSchema,
});

export type Quote = typeof QuoteSchema.Type;

export type RateLookup = (
  from: CurrencyCode,
  to: CurrencyCode
) => Option.Option<Rate>;
