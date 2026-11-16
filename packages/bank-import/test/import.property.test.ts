import { expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { runImportMachine } from "../src/import-machine.js";
import {
  ledgerLayer,
  demoAccountId,
  demoProfileId,
  demoTarget,
} from "./bank-fixture.js";

interface GeneratedLine {
  readonly amountMinor: string;
  readonly currency: string;
  readonly date: string;
  readonly description: string;
  readonly reference: string;
}

interface Rendering {
  readonly delimiter: "," | ";";
  readonly lineEnding: "\n" | "\r\n";
  readonly padding: boolean;
  readonly quoting: boolean;
}

const CASES = 500;

const SEED = 20_260_104;

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

const DATES = ["2026-01-06", "2026-02-28", "2024-02-29", "2026-12-31"] as const;

const AMOUNTS = ["480000", "-29900", "0", "1", "-1", "4250", "-12000"] as const;

const DESCRIPTIONS = [
  "Demo Coffee",
  "Demo Cloud Hosting, monthly",
  'Demo "quoted" merchant',
  "Demo Rail ticket",
  "Refund from Demo Design Tool",
  "  Padded description  ",
] as const;

const REFERENCES = [
  "",
  "DEMO-1",
  "DEMO-2",
  "DEMO 3",
  "demo-reference-4",
] as const;

const generatedLine = (): GeneratedLine => ({
  amountMinor: pick(AMOUNTS),
  currency: "EUR",
  date: pick(DATES),
  description: pick(DESCRIPTIONS),
  reference: pick(REFERENCES),
});

const identity = (line: GeneratedLine) =>
  [
    line.date,
    line.description.trim(),
    line.amountMinor,
    line.currency,
    line.reference.trim(),
  ].join("\u001F");

const rendering = (): Rendering => ({
  delimiter: pick([",", ";"] as const),
  lineEnding: pick(["\n", "\r\n"] as const),
  padding: chance(0.5),
  quoting: chance(0.5),
});

const renderField = (value: string, render: Rendering) => {
  const mustQuote =
    value.includes(render.delimiter) ||
    value.includes('"') ||
    value !== value.trim();

  if (render.quoting || mustQuote) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return render.padding ? ` ${value} ` : value;
};

const renderLine = (line: GeneratedLine, render: Rendering) =>
  [line.date, line.description, line.amountMinor, line.currency, line.reference]
    .map((value) => renderField(value, render))
    .join(render.delimiter);

const renderFile = (lines: readonly GeneratedLine[], render: Rendering) => {
  const header = [
    "date",
    "description",
    "amount_minor",
    "currency",
    "reference",
  ].join(render.delimiter);

  const body = lines.map((line) => renderLine(line, render));

  return [header, ...body].join(render.lineEnding);
};

const shuffled = (
  lines: readonly GeneratedLine[]
): readonly GeneratedLine[] => {
  const remaining = [...lines];
  const order: GeneratedLine[] = [];

  while (remaining.length > 0) {
    const [taken] = remaining.splice(
      Math.floor(nextRandom() * remaining.length),
      1
    );

    if (taken !== undefined) {
      order.push(taken);
    }
  }

  return order;
};

const withRepeats = (
  lines: readonly GeneratedLine[]
): readonly GeneratedLine[] =>
  shuffled(lines).flatMap((line) => {
    const repeats = 1 + Math.floor(nextRandom() * 3);

    return Array.from({ length: repeats }, () => line);
  });

const importText = (content: string) =>
  runImportMachine({
    accountId: demoAccountId,
    content,
    fileName: "generated-bank.csv",
    profileId: demoProfileId,
  });

const distinctIdentityCount = (lines: readonly GeneratedLine[]) =>
  new Set(lines.map(identity)).size;

const expectOneIdempotentFile = (
  lines: readonly GeneratedLine[],
  repeated: readonly GeneratedLine[]
) =>
  Effect.gen(function* importOneGeneratedFile() {
    const once = yield* importText(renderFile(repeated, rendering()));
    const twice = yield* importText(renderFile(repeated, rendering()));
    const rerendered = yield* importText(renderFile(repeated, rendering()));

    expect(once.rejected).toEqual([]);
    expect(once.imported).toBe(distinctIdentityCount(lines));
    expect(once.imported + once.alreadyImported).toBe(repeated.length);
    expect(twice.imported).toBe(0);
    expect(twice.alreadyImported).toBe(repeated.length);
    expect(rerendered.imported).toBe(0);
    expect(rerendered.alreadyImported).toBe(repeated.length);
  }).pipe(Effect.provide(ledgerLayer([demoTarget])));

it.effect(
  "importing a generated file is idempotent over 500 seeded files",
  () =>
    Effect.gen(function* proveGeneratedImportsAreIdempotent() {
      for (let index = 0; index < CASES; index += 1) {
        const lineCount = 1 + Math.floor(nextRandom() * 7);
        const lines = Array.from({ length: lineCount }, () => generatedLine());

        yield* expectOneIdempotentFile(lines, withRepeats(lines));
      }
    })
);
