import { expect, it } from "@effect/vitest";
import { Effect, Option, Predicate, Result } from "effect";

import { demoBrokerAccountId, demoTrading212Payload } from "../src/demo.js";
import type { BrokerCostBasis, BrokerHolding } from "../src/model.js";
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

const costOf = (holding: BrokerHolding): BrokerCostBasis => holding.costBasis;

const knownCost = (holding: BrokerHolding): number => {
  const cost = costOf(holding);

  if (!Predicate.isTagged(cost, "Known")) {
    throw new Error(`${holding.symbol} has no known cost basis`);
  }

  return cost.amount.minor;
};

const costReason = (holding: BrokerHolding): string => {
  const cost = costOf(holding);

  return Predicate.isTagged(cost, "Unknown") ? cost.reason : "known";
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

    expect(knownCost(world)).toBe(450_000);

    expect(Option.getOrThrow(world.pricedAt)).toBe("2026-01-05T09:00:00.000Z");

    const bitcoin = find(holdings, "DEMO-BTC");

    expect(bitcoin.assetType).toBe("crypto");

    expect(bitcoin.quantity).toBe(12_000_000);

    expect(knownCost(bitcoin)).toBe(600_000);

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

it.effect(
  "refuses an average price with more decimals than the currency holds",
  () =>
    Effect.gen(function* refuseFractionalAveragePrice() {
      const failure = yield* Effect.flip(
        trading212Holdings(
          demoBrokerAccountId,
          withInstrument(0, { averagePrice: "3.001" })
        )
      );

      expect(failure._tag).toBe("BrokerPayloadRejected");

      expect(failure.field).toBe("instruments[0].averagePrice");
    })
);

it.effect("refuses an average price that is not a decimal at all", () =>
  Effect.gen(function* refuseUnreadableAveragePrice() {
    const failure = yield* Effect.flip(
      trading212Holdings(
        demoBrokerAccountId,
        withInstrument(0, { averagePrice: "nope" })
      )
    );

    expect(failure._tag).toBe("BrokerPayloadRejected");

    expect(failure.field).toBe("instruments[0].averagePrice");
  })
);

it.effect(
  "refuses an average price whose product with the quantity is out of range",
  () =>
    Effect.gen(function* refuseOverflowingCostBasis() {
      const failure = yield* Effect.flip(
        trading212Holdings(
          demoBrokerAccountId,
          withInstrument(0, {
            averagePrice: "90071992547409.91",
            currentPrice: "1.00",
            quantity: "2",
          })
        )
      );

      expect(failure._tag).toBe("BrokerPayloadRejected");

      expect(failure.field).toBe("instruments[0].averagePrice");
    })
);

it.effect("keeps a holding without an average price and no cost basis", () =>
  Effect.gen(function* keepMissingAveragePrice() {
    const withoutAveragePrice = {
      ...demoTrading212Payload,
      instruments: demoTrading212Payload.instruments.map(
        (instrument, position) => {
          if (position !== 0) {
            return instrument;
          }

          const { averagePrice: _price, ...rest } = instrument;

          return rest;
        }
      ),
    };

    const missing = yield* trading212Holdings(
      demoBrokerAccountId,
      withoutAveragePrice
    );

    expect(costReason(find(missing, "DEMO-WORLD"))).toBe("no-cost");

    const nulled = yield* trading212Holdings(
      demoBrokerAccountId,
      withInstrument(0, { averagePrice: null })
    );

    expect(costReason(find(nulled, "DEMO-WORLD"))).toBe("no-cost");
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

const SEED = 239_621;

const CASES = 400;

const MODULUS = 2_147_483_647;

const MULTIPLIER = 48_271;

const seeded = (seed: number) => {
  let state = seed % MODULUS;

  if (state <= 0) {
    state += MODULUS - 1;
  }

  return () => {
    state = (state * MULTIPLIER) % MODULUS;

    return (state - 1) / (MODULUS - 1);
  };
};

const draw = seeded(SEED);

const intBetween = (min: number, max: number) =>
  min + Math.floor(draw() * (max - min + 1));

const pick = <A>(values: readonly A[]): A => {
  const value = values[intBetween(0, values.length - 1)];

  if (value === undefined) {
    throw new Error("pick needs at least one value");
  }

  return value;
};

const QUANTITY_SCALE = 1_000_000n;

const roundHalfAwayFromZero = (numerator: bigint): bigint => {
  const quotient = numerator / QUANTITY_SCALE;
  const remainder = numerator % QUANTITY_SCALE;
  const doubled = (remainder < 0n ? -remainder : remainder) * 2n;

  return doubled >= QUANTITY_SCALE
    ? quotient + (numerator < 0n ? -1n : 1n)
    : quotient;
};

const quantityText = (micros: number): string => {
  const whole = Math.trunc(micros / 1_000_000);

  const fraction = String(micros % 1_000_000)
    .padStart(6, "0")
    .replace(/0+$/u, "");

  return fraction.length === 0 ? String(whole) : `${whole}.${fraction}`;
};

const priceText = (minor: number): string =>
  minor % 100 === 0
    ? String(minor / 100)
    : `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;

it.effect(
  "keeps the exact cost basis or refuses the average price by field over 400 edge cases",
  () =>
    Effect.gen(function* checkCostBasisEdge() {
      const edgeQuantities = [500_000, 1_000_000, 1_500_000, 2_000_000];

      for (let index = 0; index < CASES; index += 1) {
        const micros = pick(edgeQuantities);

        const priceMinor = intBetween(
          Number.MAX_SAFE_INTEGER - 4_000_000_000,
          Number.MAX_SAFE_INTEGER
        );

        const expected = roundHalfAwayFromZero(
          BigInt(micros) * BigInt(priceMinor)
        );

        const outcome = yield* Effect.result(
          trading212Holdings(
            demoBrokerAccountId,
            withInstrument(0, {
              averagePrice: priceText(priceMinor),
              currentPrice: "1.00",
              quantity: quantityText(micros),
            })
          )
        );

        if (expected > BigInt(Number.MAX_SAFE_INTEGER)) {
          expect(Result.isFailure(outcome)).toBe(true);

          expect(
            Result.isFailure(outcome) ? outcome.failure.field : undefined
          ).toBe("instruments[0].averagePrice");
        } else {
          expect(Result.isSuccess(outcome)).toBe(true);

          const holdings = Result.isSuccess(outcome) ? outcome.success : [];

          expect(knownCost(find(holdings, "DEMO-WORLD"))).toBe(
            Number(expected)
          );
        }
      }
    })
);
