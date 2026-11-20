import { Match, Option, Schema } from "effect";
import { expect, it } from "vitest";

import { demoPortfolio, demoProfileId } from "../src/demo.js";
import { HoldingSchema } from "../src/model.js";
import type {
  HoldingValue,
  HoldingView,
  PlatformGroup,
  Total,
} from "../src/model.js";

const defined = <A>(value: A | undefined, name: string): A => {
  if (value === undefined) {
    throw new Error(`The demo portfolio has no ${name}`);
  }

  return value;
};

const group = (id: string): PlatformGroup =>
  defined(
    demoPortfolio.groups.find((candidate) => candidate.platform.id === id),
    `platform ${id}`
  );

const view = (platformId: string, symbol: string): HoldingView =>
  defined(
    group(platformId).holdings.find((candidate) => candidate.symbol === symbol),
    `holding ${symbol} on ${platformId}`
  );

const amountOf = (value: HoldingValue): number | null =>
  Match.value(value).pipe(
    Match.tag("Known", ({ amount }) => amount.minor),
    Match.tag("Unknown", () => null),
    Match.exhaustive
  );

const gainOf = (value: HoldingValue): number | null =>
  Match.value(value).pipe(
    Match.tag("Known", ({ gain }) =>
      Match.value(gain).pipe(
        Match.tag("Known", ({ amount }) => amount.minor),
        Match.tag("Unknown", () => null),
        Match.exhaustive
      )
    ),
    Match.tag("Unknown", () => null),
    Match.exhaustive
  );

const reasonOf = (value: HoldingValue): string =>
  Match.value(value).pipe(
    Match.tag("Known", () => "known"),
    Match.tag("Unknown", ({ reason }) => reason),
    Match.exhaustive
  );

const totalMinor = (total: Total): number | null =>
  Match.value(total).pipe(
    Match.tag("Known", ({ amount }) => amount.minor),
    Match.tag("Unknown", () => null),
    Match.exhaustive
  );

const totalOf = (value: PlatformGroup): number | null =>
  totalMinor(value.total);

it("values the demo book in the profile currency", () => {
  expect(demoPortfolio.profileId).toBe(demoProfileId);

  expect(demoPortfolio.baseCurrency).toBe("EUR");

  expect(demoPortfolio.valuedCount).toBe(2);

  expect(demoPortfolio.unknownCount).toBe(1);

  expect(totalMinor(demoPortfolio.total)).toBe(788_640_000);
});

it("shows each demo holding with its price, value and gain", () => {
  const world = view("generic-broker", "DEMO-WORLD");

  expect(world.quantity).toBe(1_500_000_000);

  expect(Option.getOrNull(world.price)?.minor).toBe(520_000);

  expect(amountOf(world.value)).toBe(780_000_000);

  expect(gainOf(world.value)).toBe(779_550_000);

  const bitcoin = view("generic-crypto-exchange", "DEMO-BTC");

  expect(bitcoin.quantity).toBe(12_000_000);

  expect(amountOf(bitcoin.value)).toBe(8_640_000);

  expect(gainOf(bitcoin.value)).toBe(8_040_000);
});

it("keeps a holding with no price unknown rather than zero", () => {
  const pending = view("generic-broker", "DEMO-TECH");

  expect(pending.state).toBe("pending");

  expect(pending.price._tag).toBe("None");

  expect(pending.pricedAt._tag).toBe("None");

  expect(reasonOf(pending.value)).toBe("no-price");

  const broker = group("generic-broker");

  expect(broker.unknownCount).toBe(1);

  expect(totalOf(broker)).toBe(780_000_000);
});

it("refuses a pending holding that carries a price", () => {
  const wire = {
    assetType: "stock",
    costBasis: null,
    currency: "EUR",
    id: "0192f0c1-0040-7000-8000-000000000009",
    lastPrice: { currency: "EUR", minor: 100 },
    name: "Pending With Price",
    openedOn: "2025-01-01",
    platformId: "manual",
    pricedAt: "2026-01-05T09:00:00.000Z",
    profileId: demoProfileId,
    quantity: 0,
    state: "pending",
    symbol: "PEND",
  };

  expect(Schema.decodeUnknownResult(HoldingSchema)(wire)._tag).toBe("Failure");

  expect(
    Schema.decodeUnknownResult(HoldingSchema)({
      ...wire,
      lastPrice: null,
      pricedAt: null,
    })._tag
  ).toBe("Success");
});

it("groups holdings under the platform that holds them", () => {
  expect(demoPortfolio.groups.map((entry) => entry.platform.label)).toEqual([
    "Generic Broker",
    "Generic Crypto Exchange",
    "Manual",
    "Trading 212",
  ]);

  expect(group("generic-broker").holdings).toHaveLength(2);

  expect(group("generic-crypto-exchange").holdings).toHaveLength(1);

  expect(group("manual").holdings).toHaveLength(0);

  expect(group("trading212").holdings).toHaveLength(0);
});
