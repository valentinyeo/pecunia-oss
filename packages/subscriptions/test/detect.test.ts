import { expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { shiftDays } from "../src/civil.js";
import { detectRepeatPayments } from "../src/detect.js";
import {
  ChargeSchema,
  PayeeIdSchema,
  PayeeSchema,
  PaymentSchema,
  ProfileIdSchema,
} from "../src/model.js";
import type { Charge, DetectedRepeatPayment, Payment } from "../src/model.js";

const demoProfileId = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

const payeeId = Schema.decodeSync(PayeeIdSchema)("payee-literal");

const payee = Schema.decodeSync(PayeeSchema)({
  id: payeeId,
  name: "Demo Literal Payee",
  profileId: demoProfileId,
});

const paymentOf = (currency: string, minor: number): Payment =>
  Schema.decodeSync(PaymentSchema)({ currency, minor });

interface ChargeDraft {
  readonly amount: Payment;
  readonly baseAmount: Payment;
  readonly gap: number;
}

const historyOf = (drafts: readonly ChargeDraft[]): readonly Charge[] => {
  const charges: Charge[] = [];
  let cursor = "2020-01-01";

  for (const draft of drafts) {
    cursor = shiftDays(cursor, draft.gap);

    charges.push(
      Schema.decodeSync(ChargeSchema)({
        amount: draft.amount,
        baseAmount: draft.baseAmount,
        categoryId: null,
        direction: "out",
        on: cursor,
        payeeId,
        profileId: demoProfileId,
      })
    );
  }

  return charges;
};

const gapsOf = (gaps: readonly number[]): readonly Charge[] =>
  historyOf(
    gaps.map((gap) => ({
      amount: paymentOf("EUR", 1000),
      baseAmount: paymentOf("EUR", 1000),
      gap,
    }))
  );

const claimOf = (charges: readonly Charge[]): DetectedRepeatPayment => {
  const found = detectRepeatPayments(charges, [payee]);

  expect(found).toHaveLength(1);

  const [candidate] = found;

  if (candidate === undefined) {
    throw new Error("The detector claimed no repeat payment for these charges");
  }

  return candidate;
};

it("claims nothing when the mean of two gaps falls between the bands", () => {
  expect(detectRepeatPayments(gapsOf([0, 9, 25]), [payee])).toEqual([]);
});

it("claims nothing when the mean of two gaps clears every band", () => {
  expect(detectRepeatPayments(gapsOf([0, 9, 35]), [payee])).toEqual([]);
});

it("claims a weekly cadence from two equal weekly gaps", () => {
  expect(claimOf(gapsOf([0, 7, 7])).frequency).toBe("weekly");
});

it("claims a monthly cadence when both middle gaps sit in that band", () => {
  const candidate = claimOf(gapsOf([0, 30, 31, 32, 33]));

  expect(candidate.frequency).toBe("monthly");
  expect(candidate.occurrenceCount).toBe(5);
});

it("keeps the base amount in the currency its charges were measured in", () => {
  const charges = historyOf([
    {
      amount: paymentOf("USD", 10_000),
      baseAmount: paymentOf("USD", 5000),
      gap: 0,
    },
    {
      amount: paymentOf("USD", 11_000),
      baseAmount: paymentOf("EUR", 100),
      gap: 30,
    },
    {
      amount: paymentOf("USD", 12_000),
      baseAmount: paymentOf("EUR", 300),
      gap: 30,
    },
  ]);

  const candidate = claimOf(charges);

  expect(candidate.frequency).toBe("monthly");
  expect(candidate.typicalAmount).toEqual({ currency: "USD", minor: 11_000 });
  expect(candidate.typicalBaseAmount).toEqual({ currency: "EUR", minor: 200 });
});

it("breaks a base-currency tie by the currency seen first", () => {
  const charges = historyOf([
    {
      amount: paymentOf("USD", 10_000),
      baseAmount: paymentOf("USD", 5000),
      gap: 0,
    },
    {
      amount: paymentOf("USD", 11_000),
      baseAmount: paymentOf("EUR", 100),
      gap: 30,
    },
    {
      amount: paymentOf("USD", 12_000),
      baseAmount: paymentOf("USD", 700),
      gap: 30,
    },
    {
      amount: paymentOf("USD", 13_000),
      baseAmount: paymentOf("EUR", 300),
      gap: 30,
    },
  ]);

  const candidate = claimOf(charges);

  expect(candidate.typicalBaseAmount).toEqual({ currency: "USD", minor: 2850 });
});
