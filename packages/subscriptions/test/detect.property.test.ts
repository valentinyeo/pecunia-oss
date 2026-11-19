import { expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { shiftDays } from "../src/civil.js";
import { detectRepeatPayments } from "../src/detect.js";
import {
  ChargeSchema,
  FREQUENCIES,
  PayeeIdSchema,
  PayeeSchema,
  ProfileIdSchema,
} from "../src/model.js";
import type {
  Charge,
  DetectedRepeatPayment,
  Direction,
  Frequency,
  Payee,
  PayeeId,
} from "../src/model.js";

const CASES = 600;

const AMOUNT_CASES = 400;

const IRREGULAR_CASES = 300;

const LITERAL_BANDS: Readonly<
  Record<Frequency, { readonly max: number; readonly min: number }>
> = {
  annual: { max: 380, min: 350 },
  monthly: { max: 35, min: 25 },
  quarterly: { max: 100, min: 80 },
  weekly: { max: 9, min: 5 },
};

interface Random {
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

  return { int, pick };
};

const demoProfileId = Schema.decodeSync(ProfileIdSchema)(
  "0192f0c1-0001-702d-8484-48490b729601"
);

const payeeIdOf = (text: string): PayeeId =>
  Schema.decodeSync(PayeeIdSchema)(text);

const payeeOf = (text: string): Payee =>
  Schema.decodeSync(PayeeSchema)({
    id: text,
    name: `Demo ${text}`,
    profileId: demoProfileId,
  });

const chargesOf = (input: {
  readonly direction: Direction;
  readonly gaps: readonly number[];
  readonly minors: readonly number[];
  readonly payeeId: PayeeId;
}): readonly Charge[] => {
  const charges: Charge[] = [];
  let cursor = "2020-01-01";

  for (const [index, gap] of input.gaps.entries()) {
    const minor = input.minors[index];

    if (minor === undefined) {
      throw new Error("A generated charge needs one amount per gap");
    }

    cursor = shiftDays(cursor, gap);

    charges.push(
      Schema.decodeSync(ChargeSchema)({
        amount: { currency: "EUR", minor },
        baseAmount: { currency: "EUR", minor },
        categoryId: null,
        direction: input.direction,
        on: cursor,
        payeeId: input.payeeId,
        profileId: demoProfileId,
      })
    );
  }

  return charges;
};

const repeatsOf = (value: number, count: number): readonly number[] =>
  Array.from({ length: count }, () => value);

const only = (
  found: readonly DetectedRepeatPayment[]
): DetectedRepeatPayment => {
  const [candidate] = found;

  if (candidate === undefined) {
    throw new Error("The detector claimed no repeat payment for a cadence run");
  }

  expect(found).toHaveLength(1);

  return candidate;
};

it("finds a cadence inside the band of its frequency", () => {
  const random = makeRandom(0x5e_e1_de_01);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const frequency: Frequency = random.pick(FREQUENCIES);
    const count = random.int(3, 9);
    const band = LITERAL_BANDS[frequency];
    const id = payeeIdOf(`payee-${index}`);

    const gaps = Array.from({ length: count }, () =>
      random.int(band.min, band.max)
    );

    const minors = Array.from({ length: count }, () => random.int(1, 100_000));

    const charges = chargesOf({
      direction: "out",
      gaps,
      minors,
      payeeId: id,
    });

    const candidate = only(
      detectRepeatPayments(charges, [payeeOf(`payee-${index}`)])
    );

    const last = charges.at(-1);

    if (last === undefined) {
      throw new Error("A cadence run needs at least one charge");
    }

    expect(candidate.frequency).toBe(frequency);
    expect(candidate.payeeId).toBe(id);
    expect(candidate.payeeName).toBe(`Demo payee-${index}`);
    expect(candidate.typicalAmount.currency).toBe("EUR");
    expect(candidate.typicalBaseAmount.currency).toBe("EUR");
    expect(candidate.typicalBaseAmount.minor).toBe(
      candidate.typicalAmount.minor
    );
    expect(candidate.occurrenceCount).toBe(count);
    expect(candidate.lastChargedOn).toBe(last.on);
    expect(candidate.nextExpectedOn > candidate.lastChargedOn).toBe(true);
    expect(candidate.confidence).toBeGreaterThan(0);
    expect(candidate.confidence).toBeLessThanOrEqual(1);

    checked += 1;
  }

  expect(checked).toBe(CASES);
});

it("keeps the typical charge between the smallest and largest charge", () => {
  const random = makeRandom(0x5e_e1_de_04);
  let checked = 0;

  for (let index = 0; index < AMOUNT_CASES; index += 1) {
    const frequency: Frequency = random.pick(FREQUENCIES);
    const count = random.int(3, 9);
    const band = LITERAL_BANDS[frequency];
    const id = payeeIdOf(`bounded-${index}`);

    const gaps = Array.from({ length: count }, () =>
      random.int(band.min, band.max)
    );

    const minors = Array.from({ length: count }, () => random.int(1, 100_000));

    const candidate = only(
      detectRepeatPayments(
        chargesOf({ direction: "out", gaps, minors, payeeId: id }),
        [payeeOf(`bounded-${index}`)]
      )
    );

    expect(candidate.typicalAmount.minor).toBeGreaterThanOrEqual(
      Math.min(...minors)
    );
    expect(candidate.typicalAmount.minor).toBeLessThanOrEqual(
      Math.max(...minors)
    );
    expect(candidate.typicalBaseAmount.minor).toBe(
      candidate.typicalAmount.minor
    );

    checked += 1;
  }

  expect(checked).toBe(AMOUNT_CASES);
});

it("picks a middle charge as the typical charge of an odd count", () => {
  const random = makeRandom(0x5e_e1_de_05);
  let checked = 0;

  for (let index = 0; index < AMOUNT_CASES; index += 1) {
    const frequency: Frequency = random.pick(FREQUENCIES);
    const count = random.int(1, 4) * 2 + 1;
    const band = LITERAL_BANDS[frequency];
    const id = payeeIdOf(`middle-${index}`);

    const gaps = Array.from({ length: count }, () =>
      random.int(band.min, band.max)
    );

    const minors = Array.from({ length: count }, () => random.int(1, 100_000));

    const candidate = only(
      detectRepeatPayments(
        chargesOf({ direction: "out", gaps, minors, payeeId: id }),
        [payeeOf(`middle-${index}`)]
      )
    );

    const ordered = [...minors].toSorted((left, right) => left - right);

    expect(candidate.frequency).toBe(frequency);
    expect(candidate.typicalAmount.minor).toBe(ordered[(count - 1) / 2]);

    checked += 1;
  }

  expect(checked).toBe(AMOUNT_CASES);
});

it("claims the band its gaps sit inside", () => {
  const random = makeRandom(0x5e_e1_de_06);
  let checked = 0;

  for (let index = 0; index < CASES; index += 1) {
    const frequency: Frequency = random.pick(FREQUENCIES);
    const count = random.int(3, 9);
    const band = LITERAL_BANDS[frequency];
    const id = payeeIdOf(`banded-${index}`);

    const gaps = Array.from({ length: count }, () =>
      random.int(band.min, band.max)
    );

    const minors = Array.from({ length: count }, () => random.int(1, 100_000));

    const candidate = only(
      detectRepeatPayments(
        chargesOf({ direction: "out", gaps, minors, payeeId: id }),
        [payeeOf(`banded-${index}`)]
      )
    );

    expect(candidate.frequency).toBe(frequency);
    expect(candidate.occurrenceCount).toBe(count);

    checked += 1;
  }

  expect(checked).toBe(CASES);
});

it("claims nothing when the gaps match no frequency", () => {
  const random = makeRandom(0x5e_e1_de_02);
  let checked = 0;

  for (let index = 0; index < IRREGULAR_CASES; index += 1) {
    const count = random.int(3, 9);
    const minor = random.int(1, 100_000);
    const id = payeeIdOf(`irregular-${index}`);
    const gaps = Array.from({ length: count }, () => random.int(1, 4));
    const minors = repeatsOf(minor, count);
    const charges = chargesOf({ direction: "out", gaps, minors, payeeId: id });

    expect(
      detectRepeatPayments(charges, [payeeOf(`irregular-${index}`)])
    ).toEqual([]);

    checked += 1;
  }

  expect(checked).toBe(IRREGULAR_CASES);
});

it("claims nothing from two payments, an unknown payee or incoming money", () => {
  const random = makeRandom(0x5e_e1_de_03);
  const id = payeeIdOf("payee-too-short");

  for (let index = 0; index < IRREGULAR_CASES; index += 1) {
    const count = random.int(1, 2);
    const minor = random.int(1, 100_000);

    expect(
      detectRepeatPayments(
        chargesOf({
          direction: "out",
          gaps: Array.from({ length: count }, () => random.int(25, 35)),
          minors: repeatsOf(minor, count),
          payeeId: id,
        }),
        [payeeOf("payee-too-short")]
      )
    ).toEqual([]);

    expect(
      detectRepeatPayments(
        chargesOf({
          direction: "in",
          gaps: [0, 30, 30, 30],
          minors: [minor, minor, minor, minor],
          payeeId: id,
        }),
        [payeeOf("payee-too-short")]
      )
    ).toEqual([]);

    expect(
      detectRepeatPayments(
        chargesOf({
          direction: "out",
          gaps: [0, 30, 30, 30],
          minors: [minor, minor, minor, minor],
          payeeId: id,
        }),
        []
      )
    ).toEqual([]);
  }
});
