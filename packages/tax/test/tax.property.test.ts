import { expect, it } from "@effect/vitest";
import { CurrentPerson } from "@pecunia/access";
import { codecs, minorUnitExponent, parse } from "@pecunia/core/model";
import type {
  CurrencyCode,
  ProfileId,
  TaxObligation,
  TaxProfileId,
} from "@pecunia/core/model";
import { Effect, Layer, Predicate, Ref, Result } from "effect";

import { decimalTextOf, parseDecimalAmount } from "../src/amount.js";
import { listTaxDues, syncTaxDues } from "../src/capabilities.js";
import { demoProfileId, demoTaxDueLayer, demoTaxProfile } from "../src/demo.js";
import { parseFreeAgentDues } from "../src/freeagent.js";
import {
  deterministicRandom,
  layerFor,
  otherDue,
  otherProfileId,
  owner,
  scriptedBooks,
} from "./support.js";

const CASES = 600;

const SEED = 20_260_131;

const seededRandom = (seed: number) => {
  let state = seed % 2_147_483_647;

  if (state <= 0) {
    state += 2_147_483_646;
  }

  return () => {
    state = (state * 16_807) % 2_147_483_647;

    return (state - 1) / 2_147_483_646;
  };
};

const nextRandom = seededRandom(SEED);

const pick = <Value>(values: readonly [Value, ...Value[]]): Value =>
  values[Math.floor(nextRandom() * values.length) % values.length] ?? values[0];

const chance = (probability: number) => nextRandom() < probability;

const CURRENCIES = ["GBP", "EUR", "USD", "JPY", "KWD", "UGX"] as const;

const SEPARATORS = [",", " ", "\u00A0", "'"] as const;

const DATE_PAIRS: readonly (readonly [string, string])[] = [
  ["2025-04-05", "2026-01-31"],
  ["2026-04-05", "2026-07-31"],
  ["2024-02-29", "2024-03-31"],
  ["2026-12-31", "2027-01-31"],
  ["2025-01-01", "2025-01-01"],
  ["2024-02-28", "2025-02-28"],
];

type Currency = (typeof CURRENCIES)[number];

const currencyOf = (code: Currency): CurrencyCode =>
  parse(codecs.currencyCode, code);

const expectedMinor = (whole: string, fraction: string): number =>
  Number(BigInt(`${whole}${fraction}`));

interface GeneratedDue {
  readonly currency: Currency;
  readonly dueOn: string;
  readonly fraction: string;
  readonly periodEndsOn: string;
  readonly whole: string;
}

const SAFE_INTEGER_PARTS = new Map<number, readonly [string, string]>([
  [0, ["9007199254740991", ""]],
  [2, ["90071992547409", "91"]],
  [3, ["9007199254740", "991"]],
]);

const generatedAmount = (exponent: number): readonly [string, string] => {
  const zeros = "0".repeat(exponent);
  const edge = SAFE_INTEGER_PARTS.get(exponent);

  if (edge !== undefined && nextRandom() < 0.1) {
    const [whole, fraction] = edge;

    return [chance(0.5) ? `-${whole}` : whole, fraction];
  }

  if (nextRandom() < 0.2) {
    return [chance(0.3) ? "-0" : "0", zeros];
  }

  const whole = `${chance(0.1) ? 0 : 1 + Math.floor(nextRandom() * 9999)}`;

  const fraction = Array.from({ length: exponent }, () =>
    Math.floor(nextRandom() * 10)
  ).join("");

  return [chance(0.5) ? `-${whole}` : whole, fraction];
};

const generatedDue = (
  currency: Currency,
  [periodEndsOn, dueOn]: readonly [string, string]
): GeneratedDue => {
  const [whole, fraction] = generatedAmount(
    minorUnitExponent(currencyOf(currency))
  );

  return { currency, dueOn, fraction, periodEndsOn, whole };
};

const decimalOf = (due: GeneratedDue): string =>
  minorUnitExponent(currencyOf(due.currency)) === 0
    ? due.whole
    : `${due.whole}.${due.fraction}`;

const renderPayload = (dues: readonly GeneratedDue[]) => ({
  self_assessment_payments: dues.map((due) => ({
    amount_due: decimalOf(due),
    currency: due.currency,
    due_on: due.dueOn,
    period_ends_on: due.periodEndsOn,
    status: "unpaid",
  })),
});

const shuffledDates = () => DATE_PAIRS.toSorted(() => nextRandom() - 0.5);

const generatedDues = (): readonly GeneratedDue[] => {
  const count = Math.floor(nextRandom() * 5);

  return shuffledDates()
    .slice(0, count)
    .map((pair) => generatedDue(pick(CURRENCIES), pair));
};

const dropSome = (dues: readonly GeneratedDue[]): readonly GeneratedDue[] =>
  dues.filter(() => chance(0.6));

const changeSome = (due: GeneratedDue): GeneratedDue =>
  chance(0.5) ? due : generatedDue(due.currency, [due.periodEndsOn, due.dueOn]);

interface ExpectedDue {
  readonly currency: string;
  readonly dueOn: string;
  readonly kind: string;
  readonly label: string;
  readonly minor: number;
  readonly periodEndsOn: string;
  readonly profileId: ProfileId;
}

const byDueDate = (left: ExpectedDue, right: ExpectedDue): number =>
  left.dueOn.localeCompare(right.dueOn) ||
  left.periodEndsOn.localeCompare(right.periodEndsOn) ||
  left.currency.localeCompare(right.currency);

const expectedOf = (
  dues: readonly GeneratedDue[],
  profileId: ProfileId
): readonly ExpectedDue[] =>
  dues
    .map((due) => ({
      currency: due.currency,
      dueOn: due.dueOn,
      kind: "SelfAssessment",
      label: "Self Assessment",
      minor: expectedMinor(due.whole, due.fraction),
      periodEndsOn: due.periodEndsOn,
      profileId,
    }))
    .toSorted(byDueDate);

const listedOf = (dues: readonly TaxObligation[]): readonly ExpectedDue[] =>
  dues
    .map((due) => ({
      currency: due.amount.currency,
      dueOn: due.dueOn,
      kind: due.kind,
      label: due.label,
      minor: due.amount.minor,
      periodEndsOn: due.periodEndsOn,
      profileId: due.profileId,
    }))
    .toSorted(byDueDate);

const list = (profileId: ProfileId) => listTaxDues.handler({ profileId });

const sync = (taxProfileId: TaxProfileId) =>
  syncTaxDues.handler({ profileId: demoProfileId, taxProfileId });

const SAFE_EDGE: Readonly<Record<Currency, readonly [string, number]>> = {
  EUR: ["90071992547409.91", 9_007_199_254_740_991],
  GBP: ["90071992547409.91", 9_007_199_254_740_991],
  JPY: ["9007199254740991", 9_007_199_254_740_991],
  KWD: ["9007199254740.991", 9_007_199_254_740_991],
  UGX: ["9007199254740991", 9_007_199_254_740_991],
  USD: ["90071992547409.91", 9_007_199_254_740_991],
};

const PAST_SAFE_EDGE: Readonly<Record<Currency, string>> = {
  EUR: "90071992547409.92",
  GBP: "90071992547409.92",
  JPY: "9007199254740992",
  KWD: "9007199254740.992",
  UGX: "9007199254740992",
  USD: "90071992547409.92",
};

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const dayCountOf = (year: number, month: number): number =>
  month === 2 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    ? 29
    : (monthLengths[month - 1] ?? 0);

const isRealDate = (text: string): boolean => {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(text);

  if (match === null) {
    return false;
  }

  const year = Number(match.groups?.year);
  const month = Number(match.groups?.month);
  const day = Number(match.groups?.day);

  return (
    month >= 1 && month <= 12 && day >= 1 && day <= dayCountOf(year, month)
  );
};

const generatedDate = (): string =>
  [
    1900 + Math.floor(nextRandom() * 200),
    1 + Math.floor(nextRandom() * 12),
    1 + Math.floor(nextRandom() * 31),
  ]
    .map((part, position) =>
      position === 0 ? `${part}` : `${part}`.padStart(2, "0")
    )
    .join("-");

const CALENDAR_CANDIDATES = [
  "2024-02-29",
  "2025-02-28",
  "2025-02-29",
  "2025-02-30",
  "1900-02-28",
  "1900-02-29",
  "2000-02-28",
  "2000-02-29",
  "2025-01-31",
  "2025-04-30",
  "2025-04-31",
  "2025-06-30",
  "2025-06-31",
  "2025-11-30",
  "2025-11-31",
  "2026-12-31",
  "2025-00-10",
  "2025-13-01",
  "2025-01-00",
  "2025-01-32",
];

const roundTripOf = (text: string, code: CurrencyCode) =>
  parseDecimalAmount(text, code);

it("round trips every generated amount through its exact decimal text", () => {
  for (let index = 0; index < CASES; index += 1) {
    const currency = pick(CURRENCIES);
    const code = currencyOf(currency);
    const exponent = minorUnitExponent(code);
    const [whole, fraction] = generatedAmount(exponent);
    const text = exponent === 0 ? whole : `${whole}.${fraction}`;
    const expected = expectedMinor(whole, fraction);
    const caseLabel = `case ${index}: ${currency} ${text}`;
    const parsed = roundTripOf(text, code);

    expect(Result.isSuccess(parsed), caseLabel).toBe(true);

    if (Result.isSuccess(parsed)) {
      expect(parsed.success, caseLabel).toBe(expected);
      expect(Math.sign(parsed.success), caseLabel).toBe(Math.sign(expected));

      const printed = decimalTextOf(parsed.success, code);
      const reparsed = roundTripOf(printed, code);

      expect(Result.isSuccess(reparsed), caseLabel).toBe(true);

      if (Result.isSuccess(reparsed)) {
        expect(reparsed.success, caseLabel).toBe(parsed.success);
      }

      expect(printed.startsWith("-"), caseLabel).toBe(expected < 0);
    }

    const separated = `${whole}${pick(SEPARATORS)}${fraction}`;
    const rejected = parseDecimalAmount(separated, code);

    expect(Result.isFailure(rejected), `separator ${separated}`).toBe(true);

    const tooPreciseText = exponent === 0 ? `${text}.0` : `${text}0`;
    const tooPrecise = parseDecimalAmount(tooPreciseText, code);

    expect(Result.isFailure(tooPrecise), `precision ${tooPreciseText}`).toBe(
      true
    );
  }
});

it("draws the safe-integer edge and one minor unit past it", () => {
  for (const currency of CURRENCIES) {
    const code = currencyOf(currency);
    const [edgeText, edgeMinor] = SAFE_EDGE[currency];
    const edge = roundTripOf(edgeText, code);

    expect(Result.isSuccess(edge), `${currency} ${edgeText}`).toBe(true);

    if (Result.isSuccess(edge)) {
      expect(edge.success, `${currency} ${edgeText}`).toBe(edgeMinor);
      expect(decimalTextOf(edge.success, code), `${currency} ${edgeText}`).toBe(
        edgeText
      );
    }

    const negativeEdge = roundTripOf(`-${edgeText}`, code);

    expect(Result.isSuccess(negativeEdge), `-${edgeText}`).toBe(true);

    if (Result.isSuccess(negativeEdge)) {
      expect(negativeEdge.success, `-${edgeText}`).toBe(-edgeMinor);
    }

    for (const past of [
      PAST_SAFE_EDGE[currency],
      `-${PAST_SAFE_EDGE[currency]}`,
    ]) {
      const over = roundTripOf(past, code);

      expect(Result.isFailure(over), past).toBe(true);

      if (Result.isFailure(over)) {
        expect(over.failure, past).toBe("OutOfRange");
      }
    }
  }
});

it("refuses every string that is not a real calendar date", () => {
  const candidates = [
    ...CALENDAR_CANDIDATES,
    ...Array.from({ length: CASES }, generatedDate),
  ];

  for (const date of candidates) {
    const parsed = parseFreeAgentDues({
      self_assessment_payments: [
        {
          amount_due: "10.00",
          currency: "GBP",
          due_on: date,
          period_ends_on: "1900-01-01",
          status: "unpaid",
        },
      ],
    });

    if (isRealDate(date)) {
      expect(Result.isSuccess(parsed), date).toBe(true);
      continue;
    }

    expect(Result.isFailure(parsed), date).toBe(true);

    if (Result.isFailure(parsed)) {
      expect(parsed.failure.rejections, date).toEqual([
        { field: "due_on", index: 0, reason: "NotADate" },
      ]);
    }
  }
});

it.effect(
  "replaces the stored dues with exactly the books tool's set over 600 seeded payloads",
  () =>
    Effect.gen(function* proveGeneratedSyncsAreExact() {
      for (let index = 0; index < CASES; index += 1) {
        const dues = generatedDues();
        const payload = yield* Ref.make<unknown>(renderPayload(dues));
        const caseLabel = `case ${index}: ${JSON.stringify(dues)}`;

        yield* Effect.gen(function* syncOneGeneratedPayload() {
          const first = yield* sync(demoTaxProfile.id);

          expect(first, caseLabel).toEqual({
            inserted: dues.length,
            removed: 0,
            unchanged: 0,
            updated: 0,
          });

          const stored = yield* list(demoProfileId);

          expect(listedOf(stored.dues), caseLabel).toEqual(
            expectedOf(dues, demoProfileId)
          );

          expect(
            stored.dues.every((due) =>
              Predicate.isTagged(due.status, "Estimated")
            ),
            caseLabel
          ).toBe(true);

          const again = yield* sync(demoTaxProfile.id);

          expect(again, caseLabel).toEqual({
            inserted: 0,
            removed: 0,
            unchanged: dues.length,
            updated: 0,
          });

          const next = dropSome(dues).map(changeSome);

          yield* Ref.set(payload, renderPayload(next));

          const changed = yield* sync(demoTaxProfile.id);

          expect(changed.inserted, caseLabel).toBe(0);
          expect(changed.updated + changed.unchanged, caseLabel).toBe(
            next.length
          );
          expect(changed.removed, caseLabel).toBe(dues.length - next.length);

          const after = yield* list(demoProfileId);

          expect(listedOf(after.dues), caseLabel).toEqual(
            expectedOf(next, demoProfileId)
          );

          const untouched = yield* list(otherProfileId);

          expect(
            untouched.dues.map((due) => due.id),
            caseLabel
          ).toEqual([otherDue.id]);
        }).pipe(
          Effect.provide(layerFor(owner, scriptedBooks(Ref.get(payload))))
        );
      }
    })
);

it.effect("keeps the demo profile's two Self Assessment due dates", () =>
  Effect.gen(function* demoDues() {
    const stored = yield* list(demoProfileId);

    expect(stored.dues.map((due) => due.dueOn)).toEqual([
      "2026-01-31",
      "2026-07-31",
    ]);

    expect(
      stored.dues.map((due) => [due.amount.currency, due.amount.minor])
    ).toEqual([
      ["GBP", 124_050],
      ["GBP", 98_000],
    ]);

    expect(stored.taxProfiles.map((taxProfile) => taxProfile.id)).toEqual([
      demoTaxProfile.id,
    ]);
  }).pipe(
    Effect.provide(
      Layer.mergeAll(demoTaxDueLayer, Layer.succeed(CurrentPerson, owner)).pipe(
        Layer.provide(deterministicRandom())
      )
    )
  )
);
