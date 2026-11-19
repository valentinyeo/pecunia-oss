import { Match, Option } from "effect";
import { expect, it } from "vitest";

import { demoPortfolio, demoProfileId } from "../src/demo.js";
import type { HoldingValue, HoldingView, PlatformGroup } from "../src/model.js";

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

const totalOf = (value: PlatformGroup): number | null =>
  Option.getOrNull(value.total)?.minor ?? null;

it("values the demo book in the profile currency", () => {
  expect(demoPortfolio.profileId).toBe(demoProfileId);

  expect(demoPortfolio.baseCurrency).toBe("EUR");

  expect(demoPortfolio.valuedCount).toBe(2);

  expect(demoPortfolio.unknownCount).toBe(1);

  expect(Option.getOrNull(demoPortfolio.total)?.minor).toBe(788_640_000);
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

  expect(Option.isNone(pending.price)).toBe(true);

  expect(Option.isNone(pending.pricedAt)).toBe(true);

  expect(reasonOf(pending.value)).toBe("no-price");

  const broker = group("generic-broker");

  expect(broker.unknownCount).toBe(1);

  expect(totalOf(broker)).toBe(780_000_000);
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
