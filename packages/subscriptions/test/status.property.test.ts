import { expect, it } from "@effect/vitest";
import { Predicate, Result, Schema } from "effect";

import {
  DateOnlySchema,
  PayeeIdSchema,
  PaymentSchema,
  ProfileIdSchema,
  StatusChangeSchema,
  SubscriptionIdSchema,
  SubscriptionSchema,
  TimestampMillisSchema,
} from "../src/model.js";
import type {
  RestorableTag,
  StatusChange,
  StatusTag,
  Subscription,
} from "../src/model.js";
import {
  applyStatusChange,
  isActiveStatus,
  statusWith,
  targetTagOf,
} from "../src/status.js";

const CASES = 600;

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

const STATUS_TAGS: readonly [StatusTag, ...StatusTag[]] = [
  "Cancelled",
  "Confirmed",
  "Detected",
  "Dismissed",
  "NotRecurring",
];

const RESTORABLE_TAGS: readonly [RestorableTag, ...RestorableTag[]] = [
  "Confirmed",
  "Detected",
  "Dismissed",
  "NotRecurring",
];

const CHANGES: readonly [() => StatusChange, ...(() => StatusChange)[]] = [
  () => StatusChangeSchema.cases.Cancel.make({}),
  () => StatusChangeSchema.cases.Confirm.make({}),
  () => StatusChangeSchema.cases.Dismiss.make({}),
  () => StatusChangeSchema.cases.MarkNotRecurring.make({}),
  () => StatusChangeSchema.cases.MarkRecurring.make({}),
  ...RESTORABLE_TAGS.map(
    (to) => () => StatusChangeSchema.cases.Restore.make({ to })
  ),
];

const at = (millis: number) => Schema.decodeSync(TimestampMillisSchema)(millis);

const subscriptionOf = (status: StatusTag, identifier: string): Subscription =>
  Schema.decodeSync(SubscriptionSchema)({
    amount: Schema.decodeSync(PaymentSchema)({ currency: "EUR", minor: 2900 }),
    baseAmount: Schema.decodeSync(PaymentSchema)({
      currency: "EUR",
      minor: 2900,
    }),
    categoryId: null,
    confidence: 0.7,
    frequency: "monthly",
    id: Schema.decodeSync(SubscriptionIdSchema)(identifier),
    lastChargedOn: Schema.decodeSync(DateOnlySchema)("2025-12-08"),
    nextExpectedOn: Schema.decodeSync(DateOnlySchema)("2026-01-08"),
    occurrenceCount: 11,
    payeeId: Schema.decodeSync(PayeeIdSchema)("payee-status-cases"),
    profileId: Schema.decodeSync(ProfileIdSchema)("profile-status-cases"),
    status: statusWith(status, at(1_765_000_000_000)),
  });

it("counts only the confirmed and detected notices as active cost", () => {
  const expected: Readonly<Record<StatusTag, boolean>> = {
    Cancelled: false,
    Confirmed: true,
    Detected: true,
    Dismissed: false,
    NotRecurring: false,
  };

  for (const tag of STATUS_TAGS) {
    expect(isActiveStatus(statusWith(tag, at(1_765_000_000_000)))).toBe(
      expected[tag]
    );
  }
});

it("refuses a restore unless the notice is cancelled", () => {
  const random = makeRandom(0x5e_e1_57_01);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const current = random.pick(STATUS_TAGS);
    const change = random.pick(CHANGES)();
    const row = subscriptionOf(current, `subscription-${index}`);
    const changed = applyStatusChange(row, change, at(1_765_000_000_500));
    const restoring = Predicate.isTagged(change, "Restore");

    expect(Result.isSuccess(changed)).toBe(
      restoring ? current === "Cancelled" : true
    );

    if (Result.isSuccess(changed)) {
      expect(changed.success.status._tag).toBe(targetTagOf(change));
      expect(changed.success.id).toBe(row.id);
      expect(changed.success.amount).toEqual(row.amount);
    }

    if (Result.isFailure(changed)) {
      expect(changed.failure._tag).toBe("IllegalStatusChange");
      expect(changed.failure.current).toBe(current);
      expect(changed.failure.subscriptionId).toBe(row.id);
      expect(changed.failure.repair).toContain("`changeSubscriptionStatus`");
    }

    checked += 1;
  }

  expect(checked).toBe(CASES);
});

it("keeps the time a notice first changed, and refuses a second restore", () => {
  const random = makeRandom(0x5e_e1_57_02);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const current = random.pick(STATUS_TAGS);
    const change = random.pick(CHANGES)();
    const row = subscriptionOf(current, `subscription-${index}`);
    const first = applyStatusChange(row, change, at(1_765_000_000_100));

    if (Result.isFailure(first)) {
      continue;
    }

    const second = applyStatusChange(
      first.success,
      change,
      at(1_765_000_009_900)
    );

    if (Predicate.isTagged(change, "Restore")) {
      expect(Result.isFailure(second)).toBe(true);
      checked += 1;
      continue;
    }

    if (Result.isFailure(second)) {
      throw new Error(
        `Repeating ${change._tag} failed: ${second.failure.message}`
      );
    }

    expect(second.success.status).toEqual(first.success.status);

    checked += 1;
  }

  expect(checked).toBeGreaterThan(0);
});

it("undoes a cancellation back to every notice it held", () => {
  const random = makeRandom(0x5e_e1_57_03);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const current = random.pick(RESTORABLE_TAGS);
    const row = subscriptionOf(current, `subscription-${index}`);

    const cancelled = applyStatusChange(
      row,
      StatusChangeSchema.cases.Cancel.make({}),
      at(1_765_000_000_200)
    );

    if (Result.isFailure(cancelled)) {
      throw new Error(`A cancel was refused: ${cancelled.failure.message}`);
    }

    expect(cancelled.success.status._tag).toBe("Cancelled");
    expect(cancelled.success.nextExpectedOn).toBe(row.nextExpectedOn);

    const restored = applyStatusChange(
      cancelled.success,
      StatusChangeSchema.cases.Restore.make({ to: current }),
      at(1_765_000_000_300)
    );

    if (Result.isFailure(restored)) {
      throw new Error(`A restore was refused: ${restored.failure.message}`);
    }

    expect(restored.success.status._tag).toBe(current);
    expect(restored.success.nextExpectedOn).toBe(row.nextExpectedOn);
    expect(restored.success.baseAmount).toEqual(row.baseAmount);

    checked += 1;
  }

  expect(checked).toBe(CASES);
});
