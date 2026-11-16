import { expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import { makeFakeBank } from "../src/fake-bank.js";
import type { FakeBankPage } from "../src/fake-bank.js";
import { makeMemoryBankLineStore } from "../src/memory-store.js";
import type { Cursor, RawProviderLine, RejectionReason } from "../src/model.js";
import { parseProviderLine } from "../src/parse.js";
import type { LineFieldRejection } from "../src/parse.js";
import {
  cursorOf,
  expectSynced,
  makeRandom,
  makeRecordingClock,
  nonEmpty,
  pick,
  randomInteger,
  runSyncWith,
  shuffled,
  syncRequest,
  toRawLine,
  totalByCurrency,
} from "./support.js";
import type { GeneratedLine, Random } from "./support.js";

const caseCount = 600;

const seed = 20_260_217;

const currencies: readonly [string, ...string[]] = ["GBP", "EUR", "JPY"];

const bookingDates: readonly [string, ...string[]] = [
  "2025-12-31",
  "2026-01-05",
  "2026-02-28",
  "2026-03-31",
];

const generatedLine = (random: Random, index: number): GeneratedLine => ({
  amountMinor: pick(random, [
    randomInteger(random, -1_000_000, 1_000_000),
    randomInteger(random, -1_000_000, 1_000_000),
    randomInteger(random, -1_000_000, 1_000_000),
    0,
    1,
    -1,
  ]),
  bookedOn: pick(random, bookingDates),
  currency: pick(random, currencies),
  id: `case-line-${index}`,
});

interface Scenario {
  readonly lines: readonly GeneratedLine[];
  readonly script: readonly FakeBankPage[];
}

const buildScenario = (random: Random): Scenario => {
  const size = randomInteger(random, 1, 12);
  const lines: GeneratedLine[] = [];

  for (let index = 0; index < size; index += 1) {
    lines.push(generatedLine(random, index));
  }

  const ordered = shuffled(random, lines);
  const script: FakeBankPage[] = [];
  let consumed = 0;
  let pageNumber = 0;
  let requestCursor: Cursor | null = null;

  while (consumed < ordered.length) {
    const take = Math.min(
      randomInteger(random, 1, 4),
      ordered.length - consumed
    );

    const pageLines = ordered.slice(consumed, consumed + take);

    const repeats =
      random() < 0.4
        ? [pick(random, nonEmpty(pageLines)), pick(random, nonEmpty(pageLines))]
        : [];

    consumed += take;
    pageNumber += 1;

    const nextCursor =
      consumed >= ordered.length ? null : cursorOf(`case-cursor-${pageNumber}`);

    script.push({
      failuresBeforeSuccess: randomInteger(random, 0, 2),
      lines: [...pageLines, ...repeats].map(toRawLine),
      nextCursor,
      requestCursor,
    });

    requestCursor = nextCursor;
  }

  return { lines, script };
};

const sortedEntries = (totals: ReadonlyMap<string, number>) =>
  [...totals.entries()].toSorted(([left], [right]) =>
    left.localeCompare(right)
  );

it.effect(
  "stores every line exactly once across order, paging, repeats and fetch failures",
  () =>
    Effect.gen(function* idempotentSync() {
      const random = makeRandom(seed);

      for (let caseIndex = 0; caseIndex < caseCount; caseIndex += 1) {
        const scenario = buildScenario(random);
        const memory = yield* makeMemoryBankLineStore;
        const bank = yield* makeFakeBank(scenario.script);
        const recorded = yield* makeRecordingClock;
        const request = syncRequest({});

        const outcome = expectSynced(
          yield* runSyncWith(
            bank.provider,
            memory.store,
            recorded.clock,
            request
          )
        );

        const stored = yield* memory.lines;
        const totals = yield* memory.totals;

        const secondOutcome = expectSynced(
          yield* runSyncWith(
            bank.provider,
            memory.store,
            recorded.clock,
            request
          )
        );

        const storedAfter = yield* memory.lines;
        const totalsAfter = yield* memory.totals;
        const expectedTotals = sortedEntries(totalByCurrency(scenario.lines));

        expect({
          caseIndex,
          count: outcome.count,
          pages: outcome.pages,
          rejected: outcome.rejected,
          secondCount: secondOutcome.count,
          storedAfterSecond: storedAfter.length,
          storedIds: stored.map((line) => line.providerLineId).toSorted(),
          totals: sortedEntries(totals),
          totalsAfterSecond: sortedEntries(totalsAfter),
        }).toEqual({
          caseIndex,
          count: scenario.lines.length,
          pages: scenario.script.length,
          rejected: 0,
          secondCount: 0,
          storedAfterSecond: scenario.lines.length,
          storedIds: scenario.lines.map((line) => line.id).toSorted(),
          totals: expectedTotals,
          totalsAfterSecond: expectedTotals,
        });
      }
    })
);

const amountCandidates = (random: Random): number =>
  pick(random, [
    randomInteger(random, -1_000_000, 1_000_000),
    randomInteger(random, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    pick(random, [
      0,
      1,
      -1,
      0.5,
      -0.5,
      12.34,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
      Number.MIN_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER - 1,
      1e20,
      -1e20,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]),
  ]);

const baseLine: RawProviderLine = {
  amountMinor: 100,
  bookedOn: "2026-01-05",
  currency: "GBP",
  description: "Made-up demo line",
  providerLineId: "case-line-amount",
};

const rejectionOf = (raw: RawProviderLine): LineFieldRejection | null => {
  const parsed = parseProviderLine(raw, 0);

  return Result.isFailure(parsed) ? parsed.failure : null;
};

const amountRejectionReason = (amountMinor: number): RejectionReason | null => {
  if (Number.isSafeInteger(amountMinor)) {
    return null;
  }

  if (Number.isFinite(amountMinor)) {
    return "NotASafeInteger";
  }

  return "NotANumber";
};

it.effect("accepts exactly the safe integer minor amounts", () =>
  Effect.gen(function* safeAmounts() {
    yield* Effect.void;

    const random = makeRandom(seed + 1);

    for (let caseIndex = 0; caseIndex < caseCount; caseIndex += 1) {
      const amountMinor = amountCandidates(random);
      const raw = { ...baseLine, amountMinor };
      const parsed = parseProviderLine(raw, 0);
      const rejection = rejectionOf(raw);
      const expectedReason = amountRejectionReason(amountMinor);

      expect({
        accepted: Result.isSuccess(parsed),
        caseIndex,
        field: rejection?.field ?? null,
        reason: rejection?.reason ?? null,
      }).toEqual({
        accepted: expectedReason === null,
        caseIndex,
        field: expectedReason === null ? null : "amountMinor",
        reason: expectedReason,
      });

      if (Result.isSuccess(parsed)) {
        expect(parsed.success.amountMinor).toBe(amountMinor);
      }
    }
  })
);

const currencyCandidates = (random: Random): string => {
  const valid = pick(random, currencies);

  return pick(random, [
    valid,
    valid,
    valid,
    valid,
    valid.toLowerCase(),
    valid.slice(0, 2),
    `${valid}A`,
    `${valid.slice(0, 2)}1`,
    "",
    "gbp ",
  ]);
};

it.effect("accepts exactly three uppercase letter currency codes", () =>
  Effect.gen(function* currencyCodes() {
    yield* Effect.void;

    const random = makeRandom(seed + 2);

    for (let caseIndex = 0; caseIndex < caseCount; caseIndex += 1) {
      const currency = currencyCandidates(random);
      const raw = { ...baseLine, currency };
      const parsed = parseProviderLine(raw, 0);
      const rejection = rejectionOf(raw);
      const accepted = /^[A-Z]{3}$/u.test(currency);

      expect({
        accepted: Result.isSuccess(parsed),
        caseIndex,
        field: rejection?.field ?? null,
        reason: rejection?.reason ?? null,
      }).toEqual({
        accepted,
        caseIndex,
        field: accepted ? null : "currency",
        reason: accepted ? null : "NotACurrencyCode",
      });

      if (Result.isSuccess(parsed)) {
        expect(parsed.success.currency).toBe(currency);
      }
    }
  })
);

const dateCandidates: readonly [string, ...string[]] = [
  "2026-01-05",
  "2026-02-28",
  "2024-02-29",
  "2026-12-31",
  "2026-02-30",
  "2025-02-29",
  "2026-13-01",
  "2026-00-10",
  "05/01/2026",
  "not-a-date",
  "",
];

const acceptedDates = new Set([
  "2026-01-05",
  "2026-02-28",
  "2024-02-29",
  "2026-12-31",
]);

it.effect("accepts exactly the booked dates a calendar can hold", () =>
  Effect.gen(function* calendarDates() {
    yield* Effect.void;

    const random = makeRandom(seed + 3);

    for (let caseIndex = 0; caseIndex < caseCount; caseIndex += 1) {
      const bookedOn = pick(random, dateCandidates);
      const raw = { ...baseLine, bookedOn };
      const parsed = parseProviderLine(raw, 0);
      const rejection = rejectionOf(raw);
      const accepted = acceptedDates.has(bookedOn);

      expect({
        accepted: Result.isSuccess(parsed),
        caseIndex,
        field: rejection?.field ?? null,
        reason: rejection?.reason ?? null,
      }).toEqual({
        accepted,
        caseIndex,
        field: accepted ? null : "bookedOn",
        reason: accepted ? null : "NotADate",
      });
    }
  })
);
