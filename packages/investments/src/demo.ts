import { Schema } from "effect";

import type { InvestmentMemorySeed } from "./memory.js";
import {
  BrokerAccountIdSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  ExchangeRateSchema,
  HoldingSchema,
  InvestmentPlatformSchema,
  PlatformIdSchema,
  ProfileIdSchema,
  TimestampSchema,
} from "./model.js";
import type {
  BrokerAccountId,
  CurrencyCode,
  ExchangeRate,
  Holding,
  InvestmentPlatform,
  Portfolio,
  ProfileId,
} from "./model.js";
import { portfolioOf } from "./valuation.js";

const decode = Schema.decodeSync;

export const demoProfileId: ProfileId = decode(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

export const demoBaseCurrency: CurrencyCode = decode(CurrencyCodeSchema)("EUR");

const platformId = (value: string) => decode(PlatformIdSchema)(value);

const platform = (encoded: {
  connector: InvestmentPlatform["connector"];
  enabled: boolean;
  id: string;
  label: string;
}): InvestmentPlatform => decode(InvestmentPlatformSchema)(encoded);

const timestamp = (value: string) => decode(TimestampSchema)(value);

const dateOnly = (value: string) => decode(DateOnlySchema)(value);

const holding = (encoded: Schema.Json): Holding =>
  Schema.decodeUnknownSync(HoldingSchema)(encoded);

export const demoPlatforms: readonly InvestmentPlatform[] = [
  platform({
    connector: "manual",
    enabled: true,
    id: platformId("generic-broker"),
    label: "Generic Broker",
  }),
  platform({
    connector: "manual",
    enabled: true,
    id: platformId("generic-crypto-exchange"),
    label: "Generic Crypto Exchange",
  }),
  platform({
    connector: "manual",
    enabled: true,
    id: platformId("manual"),
    label: "Manual",
  }),
  platform({
    connector: "trading212",
    enabled: true,
    id: platformId("trading212"),
    label: "Trading 212",
  }),
];

const demoPricedAt = timestamp("2026-01-05T09:00:00.000Z");

export const demoHoldings: readonly Holding[] = [
  holding({
    assetType: "etf",
    costBasis: { currency: "EUR", minor: 450_000 },
    currency: "EUR",
    id: "0192f0c1-0020-7c24-8409-4096749fc882",
    lastPrice: { currency: "EUR", minor: 520_000 },
    name: "Demo World ETF",
    openedOn: dateOnly("2025-02-01"),
    platformId: platformId("generic-broker"),
    pricedAt: demoPricedAt,
    profileId: demoProfileId,
    quantity: 1_500_000_000,
    state: "active",
    symbol: "DEMO-WORLD",
  }),
  holding({
    assetType: "crypto",
    costBasis: { currency: "EUR", minor: 600_000 },
    currency: "EUR",
    id: "0192f0c1-0021-79a1-8066-06660e199f78",
    lastPrice: { currency: "EUR", minor: 720_000 },
    name: "Demo Bitcoin",
    openedOn: dateOnly("2025-03-01"),
    platformId: platformId("generic-crypto-exchange"),
    pricedAt: demoPricedAt,
    profileId: demoProfileId,
    quantity: 12_000_000,
    state: "active",
    symbol: "DEMO-BTC",
  }),
  holding({
    assetType: "stock",
    costBasis: null,
    currency: "EUR",
    id: "0192f0c1-0022-7fa5-836b-36b4f12ac1f0",
    lastPrice: null,
    name: "Demo Tech Stock",
    openedOn: dateOnly("2025-12-01"),
    platformId: platformId("generic-broker"),
    pricedAt: null,
    profileId: demoProfileId,
    quantity: 0,
    state: "pending",
    symbol: "DEMO-TECH",
  }),
];

const rate = (encoded: {
  asOf: string;
  base: string;
  fetchedAt: string;
  quote: string;
  rate: string;
}) => decode(ExchangeRateSchema)(encoded);

export const demoRates: readonly ExchangeRate[] = [
  rate({
    asOf: "2026-01-05",
    base: "EUR",
    fetchedAt: "2026-01-05T09:05:00.000Z",
    quote: "GBP",
    rate: "0.865",
  }),
  rate({
    asOf: "2026-01-05",
    base: "EUR",
    fetchedAt: "2026-01-05T09:05:00.000Z",
    quote: "USD",
    rate: "1.09",
  }),
  rate({
    asOf: "2026-01-05",
    base: "GBP",
    fetchedAt: "2026-01-05T09:05:00.000Z",
    quote: "EUR",
    rate: "1.156069364162",
  }),
  rate({
    asOf: "2026-01-05",
    base: "USD",
    fetchedAt: "2026-01-05T09:05:00.000Z",
    quote: "EUR",
    rate: "0.917431192661",
  }),
];

export const demoMarketQuotes: readonly unknown[] = [
  {
    asOf: "2026-01-05T09:00:00.000Z",
    currency: "EUR",
    price: "5200.00",
    symbol: "DEMO-WORLD",
  },
];

export const demoCryptoQuotes: readonly unknown[] = [
  {
    asOf: "2026-01-05T09:00:00.000Z",
    currency: "EUR",
    price: "7200.00",
    symbol: "DEMO-BTC",
  },
];

export const demoBrokerAccountId: BrokerAccountId = decode(
  BrokerAccountIdSchema
)("account-demo-broker");

export const demoTrading212PlatformId = platformId("trading212");

export const demoTrading212Payload = {
  asOf: "2026-01-05T09:00:00.000Z",
  instruments: [
    {
      averagePrice: "3.00",
      currentPrice: "5200.00",
      currency: "EUR",
      name: "Demo World ETF",
      quantity: "1500",
      ticker: "DEMO-WORLD",
      type: "ETF",
    },
    {
      averagePrice: "500.00",
      currentPrice: "7200.00",
      currency: "EUR",
      name: "Demo Bitcoin",
      quantity: "12",
      ticker: "DEMO-BTC",
      type: "CRYPTO",
    },
    {
      averagePrice: "0.00",
      currentPrice: null,
      currency: "EUR",
      name: "Demo Tech Stock",
      quantity: "0",
      ticker: "DEMO-TECH",
      type: "STOCK",
    },
  ],
};

export const demoSeed: InvestmentMemorySeed = {
  holdings: demoHoldings,
  platforms: demoPlatforms,
};

export const demoPortfolio: Portfolio = portfolioOf({
  baseCurrency: demoBaseCurrency,
  holdings: demoHoldings,
  platforms: demoPlatforms,
  profileId: demoProfileId,
  rates: demoRates,
});
