import { CurrencyCodeSchema } from "@pecunia/core/settings";
import type { CurrencyCode } from "@pecunia/core/settings";
import { Layer, Schema } from "effect";

import type { DemoPriceTable, DemoRateTable } from "./fake-sources.js";
import { fakePriceSourceLayer, fakeRateSourceLayer } from "./fake-sources.js";
import type { MarketSnapshot } from "./memory.js";
import { MarketSnapshotSchema, memoryMarketStoreLayer } from "./memory.js";

const currency = (code: string): CurrencyCode =>
  Schema.decodeSync(CurrencyCodeSchema)(code);

const rateTable = (
  entries: readonly (readonly [string, string])[]
): ReadonlyMap<CurrencyCode, string> =>
  new Map(entries.map(([code, rate]) => [currency(code), rate]));

const priceTable = (
  entries: readonly (readonly [string, string, number])[]
): ReadonlyMap<
  string,
  { readonly currency: CurrencyCode; readonly minor: number }
> =>
  new Map(
    entries.map(([symbol, code, minor]) => [
      symbol,
      { currency: currency(code), minor },
    ])
  );

export const demoBaseCurrency = currency("EUR");

export const demoQuotes: readonly [CurrencyCode, ...CurrencyCode[]] = [
  currency("CAD"),
  currency("CHF"),
  currency("GBP"),
  currency("JPY"),
  currency("USD"),
];

export const demoRateTable: DemoRateTable = {
  rates: rateTable([
    ["CAD", "1.5200"],
    ["CHF", "0.9300"],
    ["GBP", "0.9000"],
    ["JPY", "172.5000"],
    ["USD", "1.1600"],
  ]),
};

export const demoPriceTable: DemoPriceTable = {
  prices: priceTable([
    ["DEMO-BTC", "EUR", 720_000],
    ["DEMO-WORLD", "EUR", 520_000],
  ]),
};

export const demoMarketSeed: MarketSnapshot = Schema.decodeSync(
  MarketSnapshotSchema
)({
  holdings: [
    {
      currency: "EUR",
      id: "0192f0c1-0020-7c24-8409-4096749fc882",
      lastPrice: { currency: "EUR", minor: 520_000 },
      pricedAt: 1_767_603_600_000,
      state: "active",
      symbol: "DEMO-WORLD",
    },
    {
      currency: "EUR",
      id: "0192f0c1-0021-79a1-8066-06660e199f78",
      lastPrice: { currency: "EUR", minor: 720_000 },
      pricedAt: 1_767_603_600_000,
      state: "active",
      symbol: "DEMO-BTC",
    },
    {
      currency: "EUR",
      id: "0192f0c1-0022-7fa5-836b-36b4f12ac1f0",
      state: "pending",
      symbol: "DEMO-TECH",
    },
  ],
  rates: [
    {
      asOf: "2025-12-01",
      base: "EUR",
      fetchedAt: 1_764_579_600_000,
      quotes: [
        { quote: "GBP", rate: "0.9" },
        { quote: "USD", rate: "1.16" },
      ],
    },
  ],
});

export const demoRateSourceLayer = fakeRateSourceLayer(demoRateTable);

export const demoPriceSourceLayer = fakePriceSourceLayer(demoPriceTable);

export const demoStoreLayer = memoryMarketStoreLayer(demoMarketSeed);

export const demoMarketLayer = Layer.mergeAll(
  demoStoreLayer,
  demoPriceSourceLayer,
  demoRateSourceLayer
);
