import { Match, Option, Predicate, Schema } from "effect";
import { expect, it } from "vitest";

import { demoProfileId, demoRates } from "../src/demo.js";
import {
  CurrencyCodeSchema,
  HoldingSchema,
  PlatformIdSchema,
  TimestampSchema,
} from "../src/model.js";
import type {
  CurrencyCode,
  Gain,
  Holding,
  HoldingValue,
} from "../src/model.js";
import { holdingValue, portfolioOf, rateLookupOf } from "../src/valuation.js";

const SEED = 20_260_105;

const CASES = 600;

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

  return remainder * 2n >= QUANTITY_SCALE ? quotient + 1n : quotient;
};

const eur = Schema.decodeSync(CurrencyCodeSchema)("EUR");

const pricedAt = Schema.decodeSync(TimestampSchema)("2026-01-05T09:00:00.000Z");

const manual = Schema.decodeSync(PlatformIdSchema)("manual");

const holdingOf = (input: {
  readonly costBasisMinor: number | null;
  readonly priceMinor: number | null;
  readonly quantity: number;
  readonly state: "active" | "closed" | "pending";
}): Holding =>
  Schema.decodeSync(HoldingSchema)({
    assetType: "etf",
    costBasis:
      input.costBasisMinor === null
        ? null
        : { currency: "EUR", minor: input.costBasisMinor },
    currency: "EUR",
    id: "0192f0c1-0040-7000-8000-000000000001",
    lastPrice:
      input.priceMinor === null
        ? null
        : { currency: "EUR", minor: input.priceMinor },
    name: "Property Holding",
    openedOn: "2025-01-01",
    platformId: manual,
    pricedAt: input.priceMinor === null ? null : pricedAt,
    profileId: demoProfileId,
    quantity: input.quantity,
    state: input.state,
    symbol: "PROP",
  });

const amountOf = (value: HoldingValue): number | null =>
  Match.value(value).pipe(
    Match.tag("Known", ({ amount }) => amount.minor),
    Match.tag("Unknown", () => null),
    Match.exhaustive
  );

const knownAmount = (value: HoldingValue): number =>
  Match.value(value).pipe(
    Match.tag("Known", ({ amount }) => amount.minor),
    Match.tag("Unknown", () => Number.NaN),
    Match.exhaustive
  );

const gainOf = (value: HoldingValue): Gain | null =>
  Match.value(value).pipe(
    Match.tag("Known", ({ gain }) => gain),
    Match.tag("Unknown", () => null),
    Match.exhaustive
  );

const gainReasonOf = (gain: Gain | null): string | null =>
  gain === null
    ? null
    : Match.value(gain).pipe(
        Match.tag("Known", () => "known"),
        Match.tag("Unknown", ({ reason }) => reason),
        Match.exhaustive
      );

const gainAmountOf = (gain: Gain | null): number | null =>
  gain === null
    ? null
    : Match.value(gain).pipe(
        Match.tag("Known", ({ amount }) => amount.minor),
        Match.tag("Unknown", () => null),
        Match.exhaustive
      );

const reasonOf = (value: HoldingValue): string =>
  Match.value(value).pipe(
    Match.tag("Known", () => "known"),
    Match.tag("Unknown", ({ reason }) => reason),
    Match.exhaustive
  );

it("values a position from integer quantity and price over 600 seeded cases", () => {
  const lookup = rateLookupOf(demoRates);

  for (let index = 0; index < CASES; index += 1) {
    const quantity = intBetween(0, 5_000_000_000);

    const priceMinor = intBetween(0, 1_000_000_000);

    const costBasisMinor =
      index % 3 === 0 ? null : intBetween(0, 2_000_000_000);

    const holding = holdingOf({
      costBasisMinor,
      priceMinor,
      quantity,
      state: pick(["active", "closed"] as const),
    });

    const value = holdingValue(holding, eur, lookup);

    const expected = roundHalfAwayFromZero(
      BigInt(quantity) * BigInt(priceMinor)
    );

    expect(value._tag).toBe("Known");

    const amount = knownAmount(value);

    expect(Number.isInteger(amount)).toBe(true);

    expect(amount).toBe(Number(expected));

    const gain = gainOf(value);

    if (costBasisMinor === null) {
      expect(gainReasonOf(gain)).toBe("no-cost-basis");
    } else {
      expect(gainAmountOf(gain)).toBe(Number(expected) - costBasisMinor);
    }
  }
});

it("keeps an unknown price unknown over 600 seeded cases", () => {
  const lookup = rateLookupOf(demoRates);

  for (let index = 0; index < CASES; index += 1) {
    const holding = holdingOf({
      costBasisMinor: index % 2 === 0 ? null : intBetween(0, 2_000_000_000),
      priceMinor: null,
      quantity: intBetween(0, 5_000_000_000),
      state: "pending",
    });

    const value = holdingValue(holding, eur, lookup);

    expect(value._tag).toBe("Unknown");

    expect(reasonOf(value)).toBe("no-price");
  }
});

it("adds only known values into the total over 400 seeded portfolios", () => {
  const lookup = rateLookupOf(demoRates);

  const platforms = [
    {
      connector: "manual" as const,
      enabled: true,
      id: manual,
      label: "Manual",
    },
  ];

  for (let index = 0; index < 400; index += 1) {
    const holdings: Holding[] = [];

    const held = intBetween(1, 4);

    for (let position = 0; position < held; position += 1) {
      const priced = draw() > 0.25;

      const quantity = intBetween(0, 1_000_000_000);

      const priceMinor = intBetween(0, 1_000_000_000);

      holdings.push({
        ...holdingOf({
          costBasisMinor: draw() > 0.5 ? intBetween(0, 1_000_000_000) : null,
          priceMinor: priced ? priceMinor : null,
          quantity,
          state: priced ? "active" : "pending",
        }),
        symbol: `PROP-${position}`,
      });
    }

    const portfolio = portfolioOf({
      baseCurrency: eur,
      holdings,
      platforms,
      profileId: demoProfileId,
      rates: demoRates,
    });

    const values = holdings.map((holding) =>
      holdingValue(holding, eur, lookup)
    );

    const known = values.flatMap((value) =>
      Predicate.isTagged(value, "Known") ? [value.amount.minor] : []
    );

    expect(portfolio.valuedCount).toBe(known.length);

    expect(portfolio.unknownCount).toBe(values.length - known.length);

    expect(portfolio.total._tag).toBe(known.length === 0 ? "None" : "Some");

    if (Option.isSome(portfolio.total)) {
      expect(portfolio.total.value.minor).toBe(
        known.reduce((sum, amount) => sum + amount, 0)
      );
    }
  }
});

it("values a holding in the profile currency through a stored rate", () => {
  const lookup = rateLookupOf(demoRates);

  const holding = Schema.decodeSync(HoldingSchema)({
    assetType: "stock",
    costBasis: { currency: "EUR", minor: 5000 },
    currency: "USD",
    id: "0192f0c1-0040-7000-8000-000000000003",
    lastPrice: { currency: "USD", minor: 10_000 },
    name: "Dollar Holding",
    openedOn: "2025-01-01",
    platformId: manual,
    pricedAt,
    profileId: demoProfileId,
    quantity: 1_000_000,
    state: "active",
    symbol: "USD-HOLDING",
  });

  const value = holdingValue(holding, eur, lookup);

  expect(amountOf(value)).toBe(9174);

  expect(
    Predicate.isTagged(value, "Known") ? value.amount.currency : undefined
  ).toBe("EUR");

  expect(gainAmountOf(gainOf(value))).toBe(4174);
});

it("refuses a rate that cannot be found and never invents one", () => {
  const lookup = rateLookupOf([]);

  const usd: CurrencyCode = Schema.decodeSync(CurrencyCodeSchema)("USD");

  const holding = Schema.decodeSync(HoldingSchema)({
    assetType: "etf",
    costBasis: { currency: "GBP", minor: 100 },
    currency: "EUR",
    id: "0192f0c1-0040-7000-8000-000000000002",
    lastPrice: { currency: "USD", minor: 1000 },
    name: "Dollar Holding",
    openedOn: "2025-01-01",
    platformId: manual,
    pricedAt,
    profileId: demoProfileId,
    quantity: 1_000_000,
    state: "active",
    symbol: "USD-HOLDING",
  });

  const value = holdingValue(holding, eur, lookup);

  expect(value._tag).toBe("Unknown");

  expect(reasonOf(value)).toBe("no-rate");

  const portfolio = portfolioOf({
    baseCurrency: eur,
    holdings: [holding],
    platforms: [
      {
        connector: "manual",
        enabled: true,
        id: manual,
        label: "Manual",
      },
    ],
    profileId: demoProfileId,
    rates: [],
  });

  expect(portfolio.valuedCount).toBe(0);

  expect(portfolio.total._tag).toBe("None");

  expect(usd satisfies string).toBe("USD");
});
