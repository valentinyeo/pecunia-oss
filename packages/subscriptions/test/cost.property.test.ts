import { expect, it } from "@effect/vitest";
import { Option, Predicate, Result, Schema } from "effect";

import { annualOf, costOf, monthlyOf, pageOf } from "../src/cost.js";
import {
  CurrencyCodeSchema,
  DateOnlySchema,
  FREQUENCIES,
  PayeeIdSchema,
  PaymentSchema,
  ProfileIdSchema,
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
  SubscriptionSchema,
  TimestampMillisSchema,
} from "../src/model.js";
import type {
  Frequency,
  Payment,
  StatusTag,
  Subscription,
  SubscriptionEntry,
} from "../src/model.js";
import { CHARGES_PER_YEAR } from "../src/schedule.js";
import { statusWith } from "../src/status.js";

const CASES = 700;

interface Random {
  readonly chance: (probability: number) => boolean;
  readonly int: (min: number, max: number) => number;
  readonly pick: <A>(items: readonly [A, ...A[]]) => A;
}

const makeRandom = (seed: number): Random => {
  let state = seed % 4_294_967_296;

  const next = () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;

    return state / 4_294_967_296;
  };

  const int = (min: number, max: number) =>
    min + Math.floor(next() * (max - min + 1));

  const pick = <A>(items: readonly [A, ...A[]]): A => {
    const chosen = items[int(0, items.length - 1)];

    if (chosen === undefined) {
      throw new Error("A generated pick needs a non-empty source list");
    }

    return chosen;
  };

  return { chance: (probability) => next() < probability, int, pick };
};

const currency = Schema.decodeSync(CurrencyCodeSchema);

const dateOnly = Schema.decodeSync(DateOnlySchema);

const payment = Schema.decodeSync(PaymentSchema);

const profileId = Schema.decodeSync(ProfileIdSchema)("profile-cost-cases");

const payeeId = Schema.decodeSync(PayeeIdSchema)("payee-cost-cases");

const at = Schema.decodeSync(TimestampMillisSchema)(1_765_000_000_000);

const STATUS_TAGS: readonly [StatusTag, ...StatusTag[]] = [
  "Cancelled",
  "Confirmed",
  "Detected",
  "Dismissed",
  "NotRecurring",
];

const LITERAL_CHARGES_PER_YEAR: Readonly<Record<Frequency, number>> = {
  annual: 1,
  monthly: 12,
  quarterly: 4,
  weekly: 52,
};

const subscriptionOf = (input: {
  readonly baseAmount: Payment;
  readonly frequency: Frequency;
  readonly id: string;
  readonly status: StatusTag;
}): Subscription =>
  Schema.decodeSync(SubscriptionSchema)({
    amount: input.baseAmount,
    baseAmount: input.baseAmount,
    categoryId: null,
    confidence: 0.8,
    frequency: input.frequency,
    id: Schema.decodeSync(SubscriptionIdSchema)(input.id),
    lastChargedOn: dateOnly("2025-12-08"),
    nextExpectedOn: dateOnly("2026-01-08"),
    occurrenceCount: 4,
    payeeId,
    profileId,
    status: statusWith(input.status, at),
  });

const entryOf = (
  subscription: Subscription,
  index: number
): SubscriptionEntry => ({
  payeeName: `Demo Payee ${index}`,
  subscription,
});

const amountOf = (minor: number, code = "EUR"): Payment =>
  payment({ currency: currency(code), minor });

const countsTowardsCost = (tag: StatusTag): boolean =>
  tag === "Confirmed" || tag === "Detected";

it("multiplies the annual cost by the frequency table", () => {
  expect(annualOf(amountOf(29_900), "monthly")).toEqual(
    Result.succeed({
      currency: "EUR",
      minor: 358_800,
    })
  );
  expect(annualOf(amountOf(4250), "weekly")).toEqual(
    Result.succeed({ currency: "EUR", minor: 221_000 })
  );
  expect(annualOf(amountOf(100), "quarterly")).toEqual(
    Result.succeed({ currency: "EUR", minor: 400 })
  );
  expect(annualOf(amountOf(100), "annual")).toEqual(
    Result.succeed({ currency: "EUR", minor: 100 })
  );
});

it("keeps the annual cost exact and the monthly cost inside one minor unit", () => {
  const random = makeRandom(0x5e_e1_c0_01);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const minor = random.int(1, 10_000_000);
    const frequency = random.pick(FREQUENCIES);
    const amount = amountOf(minor, random.pick(["EUR", "GBP", "JPY", "USD"]));
    const annual = annualOf(amount, frequency);

    if (Result.isFailure(annual)) {
      throw new Error(`A small payment overflowed: ${annual.failure.message}`);
    }

    expect(annual.success.currency).toBe(amount.currency);
    expect(BigInt(annual.success.minor)).toBe(
      BigInt(minor) * BigInt(LITERAL_CHARGES_PER_YEAR[frequency])
    );

    const monthly = monthlyOf(annual.success);

    if (Result.isFailure(monthly)) {
      throw new Error(
        `A small annual cost overflowed: ${monthly.failure.message}`
      );
    }

    expect(monthly.success.currency).toBe(amount.currency);
    expect(monthly.success.minor).toBe(Math.floor(annual.success.minor / 12));
    expect(monthly.success.minor * 12).toBeLessThanOrEqual(
      annual.success.minor
    );
    expect((monthly.success.minor + 1) * 12).toBeGreaterThan(
      annual.success.minor
    );

    checked += 1;
  }

  expect(checked).toBe(CASES);
});

it("refuses an annual or monthly cost past the range of an integer", () => {
  const huge = amountOf(Number.MAX_SAFE_INTEGER);

  expect(Result.isFailure(annualOf(huge, "weekly"))).toBe(true);

  const failure = annualOf(huge, "weekly");

  if (Result.isFailure(failure)) {
    expect(failure.failure._tag).toBe("SubscriptionCostOverflow");
    expect(failure.failure.operation).toBe("annual");
    expect(failure.failure.repair).toContain("`listSubscriptions`");
  }

  expect(
    Result.isFailure(
      costOf(
        subscriptionOf({
          baseAmount: huge,
          frequency: "weekly",
          id: "subscription-huge",
          status: "Confirmed",
        })
      )
    )
  ).toBe(true);
});

it("adds up only the repeat payments the profile still counts", () => {
  const random = makeRandom(0x5e_e1_c0_02);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const count = random.int(1, 8);

    const entries = Array.from({ length: count }, (_, position) =>
      entryOf(
        subscriptionOf({
          baseAmount: amountOf(random.int(1, 500_000)),
          frequency: random.pick(FREQUENCIES),
          id: `subscription-${index}-${position}`,
          status: random.pick(STATUS_TAGS),
        }),
        position
      )
    );

    const page = pageOf(
      entries,
      SubscriptionFilterSchema.cases.All.make({}),
      currency("EUR")
    );

    if (Result.isFailure(page)) {
      throw new Error(`A small book overflowed: ${page.failure.message}`);
    }

    const active = entries.filter((entry) =>
      countsTowardsCost(entry.subscription.status._tag)
    );

    const expectedAnnual = active.reduce(
      (total, entry) =>
        total +
        BigInt(entry.subscription.baseAmount.minor) *
          BigInt(CHARGES_PER_YEAR[entry.subscription.frequency]),
      0n
    );

    const expectedMonthly = active.reduce(
      (total, entry) =>
        total +
        (BigInt(entry.subscription.baseAmount.minor) *
          BigInt(CHARGES_PER_YEAR[entry.subscription.frequency])) /
          12n,
      0n
    );

    expect(BigInt(page.success.activeAnnual.minor)).toBe(expectedAnnual);
    expect(BigInt(page.success.activeMonthly.minor)).toBe(expectedMonthly);
    expect(page.success.baseCurrency).toBe("EUR");
    expect(page.success.subscriptions).toHaveLength(count);

    for (const view of page.success.subscriptions) {
      expect(Option.isSome(view.nextCharge)).toBe(
        countsTowardsCost(view.status._tag)
      );
    }

    const activeOnly = pageOf(
      entries,
      SubscriptionFilterSchema.cases.Active.make({}),
      currency("EUR")
    );

    if (Result.isFailure(activeOnly)) {
      throw new Error(`A small book overflowed: ${activeOnly.failure.message}`);
    }

    expect(activeOnly.success.subscriptions).toHaveLength(active.length);
    expect(activeOnly.success.activeAnnual).toEqual(page.success.activeAnnual);

    checked += 1;
  }

  expect(checked).toBe(CASES);
});

it("refuses to add a base cost kept in another currency", () => {
  const entries = [
    entryOf(
      subscriptionOf({
        baseAmount: amountOf(1000),
        frequency: "monthly",
        id: "subscription-eur",
        status: "Confirmed",
      }),
      0
    ),
    entryOf(
      subscriptionOf({
        baseAmount: amountOf(1000, "USD"),
        frequency: "monthly",
        id: "subscription-usd",
        status: "Confirmed",
      }),
      1
    ),
  ];

  const page = pageOf(
    entries,
    SubscriptionFilterSchema.cases.All.make({}),
    currency("EUR")
  );

  expect(Result.isFailure(page)).toBe(true);

  if (
    Result.isFailure(page) &&
    Predicate.isTagged(page.failure, "BaseCurrencyMismatch")
  ) {
    expect(page.failure.baseCurrency).toBe("EUR");
    expect(page.failure.currency).toBe("USD");
  }
});
