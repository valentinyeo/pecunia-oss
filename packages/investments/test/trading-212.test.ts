import { expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import { demoBrokerAccountId, demoTrading212Payload } from "../src/demo.js";
import type { BrokerHolding } from "../src/model.js";
import { trading212Holdings } from "../src/trading-212.js";

const find = (
  holdings: readonly BrokerHolding[],
  symbol: string
): BrokerHolding => {
  const found = holdings.find((holding) => holding.symbol === symbol);

  if (found === undefined) {
    throw new Error(`Trading 212 did not return ${symbol}`);
  }

  return found;
};

const withInstrument = (
  index: number,
  changes: Readonly<Record<string, number | string | null>>
) => ({
  ...demoTrading212Payload,
  instruments: demoTrading212Payload.instruments.map((instrument, position) =>
    position === index ? { ...instrument, ...changes } : instrument
  ),
});

it.effect("reads quantities and prices from the recorded Trading 212 API", () =>
  Effect.gen(function* readRecordedPortfolio() {
    const holdings = yield* trading212Holdings(
      demoBrokerAccountId,
      demoTrading212Payload
    );

    expect(holdings).toHaveLength(3);

    const world = find(holdings, "DEMO-WORLD");

    expect(world.assetType).toBe("etf");

    expect(world.quantity).toBe(1_500_000_000);

    expect(world.openedOn).toBe("2026-01-05");

    expect(Option.getOrThrow(world.price).minor).toBe(520_000);

    expect(Option.getOrThrow(world.costBasis).minor).toBe(450_000);

    expect(Option.getOrThrow(world.pricedAt)).toBe("2026-01-05T09:00:00.000Z");

    const bitcoin = find(holdings, "DEMO-BTC");

    expect(bitcoin.assetType).toBe("crypto");

    expect(bitcoin.quantity).toBe(12_000_000);

    expect(Option.getOrThrow(bitcoin.costBasis).minor).toBe(600_000);

    const pending = find(holdings, "DEMO-TECH");

    expect(pending.quantity).toBe(0);

    expect(pending.price._tag).toBe("None");

    expect(pending.pricedAt._tag).toBe("None");
  })
);

it.effect("refuses a quantity that would need a float", () =>
  Effect.gen(function* refuseFractionalQuantity() {
    const failure = yield* Effect.flip(
      trading212Holdings(
        demoBrokerAccountId,
        withInstrument(0, { quantity: "12.1234567" })
      )
    );

    expect(failure._tag).toBe("BrokerPayloadRejected");

    expect(failure.field).toBe("instruments[0].quantity");
  })
);

it.effect("refuses a price with more decimals than the currency holds", () =>
  Effect.gen(function* refuseFractionalPrice() {
    const failure = yield* Effect.flip(
      trading212Holdings(
        demoBrokerAccountId,
        withInstrument(0, { currentPrice: "520.005" })
      )
    );

    expect(failure._tag).toBe("BrokerPayloadRejected");

    expect(failure.field).toBe("instruments[0].currentPrice");
  })
);

it.effect("refuses a currency code Trading 212 did not send", () =>
  Effect.gen(function* refuseUnknownCurrency() {
    const failure = yield* Effect.flip(
      trading212Holdings(
        demoBrokerAccountId,
        withInstrument(0, { currency: "EURO" })
      )
    );

    expect(failure._tag).toBe("BrokerPayloadRejected");

    expect(failure.field).toBe("instruments[0].currency");
  })
);

it.effect("refuses a payload that is not a Trading 212 portfolio", () =>
  Effect.gen(function* refuseUnknownPayload() {
    const failure = yield* Effect.flip(
      trading212Holdings(demoBrokerAccountId, { instruments: 1 })
    );

    expect(failure._tag).toBe("BrokerPayloadRejected");

    expect(failure.field).toBe("payload");
  })
);
