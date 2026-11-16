import { expect, it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";

import { makeFakeBank } from "../src/fake-bank.js";
import type { FakeBankPage } from "../src/fake-bank.js";
import { makeMemoryBankLineStore } from "../src/memory-store.js";
import type {
  Cursor,
  LineField,
  LineFieldRejection,
  RawProviderLine,
  RejectionReason,
} from "../src/model.js";
import { parseProviderLine } from "../src/parse.js";
import {
  cursorOf,
  expectSynced,
  makeRandom,
  makeRecordingClock,
  nonEmpty,
  pick,
  randomInteger,
  rawLineWith,
  runSyncWith,
  shuffled,
  syncRequest,
  toRawLine,
  totalByCurrency,
} from "./support.js";
import type { GeneratedLine, Random, RawLineOverrides } from "./support.js";

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

const sortedEntries = (totals: ReadonlyMap<string, bigint>) =>
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

  return Result.isFailure(parsed) ? (parsed.failure.failures[0] ?? null) : null;
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

const fieldOrder: readonly LineField[] = [
  "providerLineId",
  "bookedOn",
  "amountMinor",
  "currency",
  "description",
];

interface BadFieldValue {
  readonly reason: RejectionReason;
  readonly value: unknown;
}

const badFieldValues: Readonly<
  Record<LineField, readonly [BadFieldValue, ...BadFieldValue[]]>
> = {
  amountMinor: [
    { reason: "NotASafeInteger", value: 12.5 },
    { reason: "NotASafeInteger", value: Number.MAX_SAFE_INTEGER + 1 },
    { reason: "NotANumber", value: "1000" },
    { reason: "NotANumber", value: Number.NaN },
  ],
  bookedOn: [
    { reason: "NotADate", value: "2026-02-30" },
    { reason: "NotADate", value: "05/01/2026" },
    { reason: "NotAString", value: 20_260_105 },
  ],
  currency: [
    { reason: "NotACurrencyCode", value: "gbp" },
    { reason: "NotACurrencyCode", value: "" },
    { reason: "NotAString", value: 840 },
  ],
  description: [
    { reason: "NotAString", value: 42 },
    { reason: "NotAString", value: null },
  ],
  providerLineId: [
    { reason: "EmptyString", value: "" },
    { reason: "NotAString", value: 12 },
  ],
};

interface CaseLine {
  readonly failures: readonly LineFieldRejection[];
  readonly raw: RawProviderLine;
}

const buildCaseLines = (random: Random): readonly CaseLine[] => {
  const count = randomInteger(random, 1, 4);
  const lines: CaseLine[] = [];

  for (let index = 0; index < count; index += 1) {
    const chosen = new Set(
      shuffled(random, fieldOrder).slice(
        0,
        randomInteger(random, 0, fieldOrder.length)
      )
    );

    const failures: LineFieldRejection[] = [];
    const overrides: RawLineOverrides = {};

    for (const field of fieldOrder) {
      if (chosen.has(field)) {
        const bad = pick(random, badFieldValues[field]);

        overrides[field] = bad.value;
        failures.push({ field, reason: bad.reason });
      }
    }

    lines.push({
      failures,
      raw: rawLineWith(baseLine, {
        providerLineId: `case-bad-${index}`,
        ...overrides,
      }),
    });
  }

  return lines;
};

const paginate = <A>(
  random: Random,
  values: readonly A[]
): readonly (readonly A[])[] => {
  const pages: (readonly A[])[] = [];
  let consumed = 0;

  while (consumed < values.length) {
    const take = Math.min(
      randomInteger(random, 1, 3),
      values.length - consumed
    );

    pages.push(values.slice(consumed, consumed + take));
    consumed += take;
  }

  return pages;
};

const scriptedChain = (
  pages: readonly (readonly RawProviderLine[])[]
): readonly FakeBankPage[] => {
  let requestCursor: Cursor | null = null;

  return pages.map((lines, pageIndex) => {
    const nextCursor =
      pageIndex === pages.length - 1
        ? null
        : cursorOf(`case-bad-cursor-${pageIndex}`);

    const page: FakeBankPage = {
      failuresBeforeSuccess: 0,
      lines,
      nextCursor,
      requestCursor,
    };

    requestCursor = nextCursor;

    return page;
  });
};

const rawIdOf = (raw: RawProviderLine): string | null =>
  Schema.is(Schema.String)(raw.providerLineId) && raw.providerLineId !== ""
    ? raw.providerLineId
    : null;

interface ExpectedRejection {
  readonly failures: readonly LineFieldRejection[];
  readonly index: number;
  readonly rawProviderLineId: string | null;
}

const expectedRejections = (
  pages: readonly (readonly CaseLine[])[]
): readonly ExpectedRejection[] =>
  pages.flatMap((pageLines) =>
    pageLines.flatMap((line, index) =>
      line.failures.length === 0
        ? []
        : [
            {
              failures: line.failures,
              index,
              rawProviderLineId: rawIdOf(line.raw),
            },
          ]
    )
  );

it.effect(
  "names exactly the bad fields of every rejected line in page order",
  () =>
    Effect.gen(function* everyBadField() {
      const random = makeRandom(seed + 4);

      for (let caseIndex = 0; caseIndex < caseCount; caseIndex += 1) {
        const lines = buildCaseLines(random);
        const pages = paginate(random, lines);
        const memory = yield* makeMemoryBankLineStore;

        const bank = yield* makeFakeBank(
          scriptedChain(pages.map((page) => page.map((line) => line.raw)))
        );

        const recorded = yield* makeRecordingClock;

        const outcome = expectSynced(
          yield* runSyncWith(
            bank.provider,
            memory.store,
            recorded.clock,
            syncRequest({})
          )
        );

        const expected = expectedRejections(pages);

        expect({
          caseIndex,
          count: outcome.count,
          rejected: outcome.rejected,
          rejectedLines: outcome.rejectedLines,
          rejectedNotShown: outcome.rejectedNotShown,
        }).toEqual({
          caseIndex,
          count: lines.length - expected.length,
          rejected: expected.length,
          rejectedLines: expected,
          rejectedNotShown: 0,
        });
      }
    })
);

const extremeAmounts = (random: Random): number =>
  pick(random, [
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
    2,
    -2,
    0,
    1,
    -1,
    randomInteger(random, -1_000_000, 1_000_000),
  ]);

it.effect(
  "keeps an exact bigint total per currency and adds nothing on a rerun",
  () =>
    Effect.gen(function* exactTotals() {
      const random = makeRandom(seed + 5);

      for (let caseIndex = 0; caseIndex < caseCount; caseIndex += 1) {
        const stressCurrency = pick(random, currencies);
        const extra = randomInteger(random, 0, 5);

        const amounts = [
          Number.MAX_SAFE_INTEGER,
          2,
          -Number.MAX_SAFE_INTEGER,
          ...Array.from({ length: extra }, () => extremeAmounts(random)),
        ];

        const lines: GeneratedLine[] = amounts.map((amountMinor, index) => ({
          amountMinor,
          bookedOn: pick(random, bookingDates),
          currency: index < 3 ? stressCurrency : pick(random, currencies),
          id: `total-line-${index}`,
        }));

        const pages = paginate(random, lines);
        const memory = yield* makeMemoryBankLineStore;

        const bank = yield* makeFakeBank(
          scriptedChain(pages.map((page) => page.map(toRawLine)))
        );

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

        const totals = sortedEntries(yield* memory.totals);

        const secondOutcome = expectSynced(
          yield* runSyncWith(
            bank.provider,
            memory.store,
            recorded.clock,
            request
          )
        );

        const totalsAfter = sortedEntries(yield* memory.totals);
        const expectedTotals = sortedEntries(totalByCurrency(lines));

        expect({
          caseIndex,
          count: outcome.count,
          rejected: outcome.rejected,
          secondCount: secondOutcome.count,
          secondRejected: secondOutcome.rejected,
          storedAfterSecond: (yield* memory.lines).length,
          totals,
          totalsAfter,
        }).toEqual({
          caseIndex,
          count: lines.length,
          rejected: 0,
          secondCount: 0,
          secondRejected: 0,
          storedAfterSecond: lines.length,
          totals: expectedTotals,
          totalsAfter: expectedTotals,
        });
      }
    })
);
