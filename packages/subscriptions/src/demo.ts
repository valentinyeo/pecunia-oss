import { PersonSchema, ProfileIdSchema } from "@pecunia/access";
import { Schema } from "effect";

import { shiftDays, shiftMonths } from "./civil.js";
import type {
  MemoryCategory,
  MemoryProfile,
  MemorySubscriptionSeed,
} from "./memory.js";
import {
  CategoryIdSchema,
  ChargeSchema,
  CurrencyCodeSchema,
  DateOnlySchema,
  PayeeIdSchema,
  PaymentSchema,
  SubscriptionIdSchema,
  SubscriptionSchema,
  TimestampMillisSchema,
} from "./model.js";
import type {
  CategoryId,
  Charge,
  Direction,
  Frequency,
  Payee,
  PayeeId,
  Payment,
  Subscription,
  TimestampMillis,
} from "./model.js";
import { statusWith } from "./status.js";

const decode = Schema.decodeSync;

export const demoProfileId = decode(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

export const demoPersonalProfileId = decode(ProfileIdSchema)(
  "0192f0c1-0002-7f50-85ff-5ffb4c3ef459"
);

export const demoPerson = decode(PersonSchema)({
  email: "demo@example.com",
  memberships: [{ profileId: demoProfileId, role: "owner" }],
  personId: "person-demo",
});

export const demoViewer = decode(PersonSchema)({
  email: "finance@example.com",
  memberships: [{ profileId: demoProfileId, role: "viewer" }],
  personId: "person-demo-viewer",
});

export const demoStranger = decode(PersonSchema)({
  email: "stranger@example.com",
  memberships: [{ profileId: demoPersonalProfileId, role: "owner" }],
  personId: "person-demo-stranger",
});

const category = (id: string) => decode(CategoryIdSchema)(id);

const payeeId = (id: string) => decode(PayeeIdSchema)(id);

const dateOnly = (text: string) => decode(DateOnlySchema)(text);

const at = (millis: number) => decode(TimestampMillisSchema)(millis);

const currency = (code: string) => decode(CurrencyCodeSchema)(code);

const payment = (code: string, minor: number) =>
  decode(PaymentSchema)({ currency: currency(code), minor });

const cloudCategory = category("0192f0c1-000e-7d8a-8a87-a87dd2b6c1ba");

const softwareCategory = category("0192f0c1-000d-75e9-8fd7-fd7e43c901ee");

const subscriptionCategory = category("0192f0c1-000f-755b-8ae4-ae47d20b52cf");

const mealsCategory = category("0192f0c1-0011-79f9-8c9a-c9af5a7eff0d");

export const demoCategories: readonly MemoryCategory[] = [
  { id: cloudCategory, profileId: demoProfileId },
  { id: mealsCategory, profileId: demoProfileId },
  { id: softwareCategory, profileId: demoProfileId },
  { id: subscriptionCategory, profileId: demoProfileId },
];

export const demoProfiles: readonly MemoryProfile[] = [
  { baseCurrency: currency("EUR"), id: demoProfileId },
  { baseCurrency: currency("EUR"), id: demoPersonalProfileId },
];

const cloudId = payeeId("0192f0c1-0009-71f7-8998-998f8330df68");

const coffeeId = payeeId("0192f0c1-000a-743c-890f-90fb094546ce");

const designToolId = payeeId("0192f0c1-000b-7839-88f7-8f744744f3e0");

export const demoPayees: readonly Payee[] = [
  {
    id: cloudId,
    name: "Demo Cloud Hosting",
    profileId: demoProfileId,
  },
  { id: coffeeId, name: "Demo Coffee", profileId: demoProfileId },
  {
    id: designToolId,
    name: "Demo Design Tool",
    profileId: demoProfileId,
  },
];

interface ChargeRun {
  readonly amount: Payment;
  readonly baseAmount: Payment;
  readonly categoryId: CategoryId;
  readonly count: number;
  readonly direction: Direction;
  readonly lastOn: string;
  readonly payee: PayeeId;
  readonly step: "month" | "week";
}

const runOf = (run: ChargeRun): readonly Charge[] =>
  Array.from({ length: run.count }, (_, index) => {
    const back = run.count - 1 - index;

    const on =
      run.step === "month"
        ? shiftMonths(run.lastOn, -back)
        : shiftDays(run.lastOn, -back * 7);

    return decode(ChargeSchema)({
      amount: run.amount,
      baseAmount: run.baseAmount,
      categoryId: run.categoryId,
      direction: run.direction,
      on: dateOnly(on),
      payeeId: run.payee,
      profileId: demoProfileId,
    });
  });

const cloudCharge = payment("EUR", 29_900);

const coffeeCharge = payment("EUR", 4250);

const designCharge = payment("USD", 2999);

const designBaseCharge = payment("EUR", 2765);

const refund = payment("EUR", 3500);

export const demoCharges: readonly Charge[] = [
  ...runOf({
    amount: cloudCharge,
    baseAmount: cloudCharge,
    categoryId: cloudCategory,
    count: 11,
    direction: "out",
    lastOn: "2025-12-08",
    payee: cloudId,
    step: "month",
  }),
  ...runOf({
    amount: coffeeCharge,
    baseAmount: coffeeCharge,
    categoryId: mealsCategory,
    count: 6,
    direction: "out",
    lastOn: "2025-10-28",
    payee: coffeeId,
    step: "week",
  }),
  ...runOf({
    amount: designCharge,
    baseAmount: designBaseCharge,
    categoryId: subscriptionCategory,
    count: 3,
    direction: "out",
    lastOn: "2025-05-11",
    payee: designToolId,
    step: "month",
  }),
  decode(ChargeSchema)({
    amount: refund,
    baseAmount: refund,
    categoryId: subscriptionCategory,
    direction: "in",
    on: dateOnly("2025-10-06"),
    payeeId: designToolId,
    profileId: demoProfileId,
  }),
];

const subscriptionRow = (row: {
  readonly amount: Payment;
  readonly baseAmount: Payment;
  readonly categoryId: CategoryId;
  readonly confidence: number;
  readonly frequency: Frequency;
  readonly id: string;
  readonly lastChargedOn: string;
  readonly nextExpectedOn: string;
  readonly occurrenceCount: number;
  readonly payee: PayeeId;
  readonly status: "Cancelled" | "Confirmed";
  readonly statusChangedAt: TimestampMillis;
}): Subscription =>
  decode(SubscriptionSchema)({
    amount: row.amount,
    baseAmount: row.baseAmount,
    categoryId: row.categoryId,
    confidence: row.confidence,
    frequency: row.frequency,
    id: decode(SubscriptionIdSchema)(row.id),
    lastChargedOn: dateOnly(row.lastChargedOn),
    nextExpectedOn: dateOnly(row.nextExpectedOn),
    occurrenceCount: row.occurrenceCount,
    payeeId: row.payee,
    profileId: demoProfileId,
    status: statusWith(row.status, row.statusChangedAt),
  });

export const demoSubscriptions: readonly Subscription[] = [
  subscriptionRow({
    amount: cloudCharge,
    baseAmount: cloudCharge,
    categoryId: cloudCategory,
    confidence: 0.96,
    frequency: "monthly",
    id: "0192f0c1-0033-7362-801a-01a8162ef271",
    lastChargedOn: "2025-12-08",
    nextExpectedOn: "2026-01-08",
    occurrenceCount: 11,
    payee: cloudId,
    status: "Confirmed",
    statusChangedAt: at(1_740_819_600_000),
  }),
  subscriptionRow({
    amount: coffeeCharge,
    baseAmount: coffeeCharge,
    categoryId: mealsCategory,
    confidence: 0.61,
    frequency: "weekly",
    id: "0192f0c1-0034-7407-85f0-5f03b39b14e9",
    lastChargedOn: "2025-10-28",
    nextExpectedOn: "2026-01-05",
    occurrenceCount: 6,
    payee: coffeeId,
    status: "Cancelled",
    statusChangedAt: at(1_762_333_200_000),
  }),
];

export const demoSubscriptionSeed: MemorySubscriptionSeed = {
  categories: demoCategories,
  charges: demoCharges,
  payees: demoPayees,
  profiles: demoProfiles,
  subscriptions: demoSubscriptions,
};
