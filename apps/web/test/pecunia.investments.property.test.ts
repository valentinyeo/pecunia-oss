import { expect, it } from "@effect/vitest";
import type { BankLinePage } from "@pecunia/bank-lines/model";
import {
  GainSchema,
  HoldingValueSchema,
  MoneySchema,
} from "@pecunia/investments/model";
import type { HoldingValue } from "@pecunia/investments/model";
import { Option, Schema } from "effect";

import {
  Findings,
  findingsOf,
  SearchHolding,
} from "../src/client/pecunia/search/model.js";
import type {
  SearchHoldingValue,
  SearchWorld,
} from "../src/client/pecunia/search/model.js";
import { holdingValueText } from "../src/features/pecunia/investments.js";
import { formatMinor } from "../src/features/pecunia/money-format.js";

const CASES = 500;

const seeded = (salt: number) => {
  let state = 20_260_215 + salt;

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state;
  };
};

const words = [
  "Demo",
  "World",
  "Fund",
  "Bitcoin",
  "Pension",
  "Shares",
  "Bond",
  "Cash",
] as const;

const currencies = ["EUR", "GBP", "USD", "JPY", "CHF"] as const;

const pick = <T>(items: readonly [T, ...T[]], roll: () => number): T =>
  items[roll() % items.length] ?? items[0];

const decodeHolding = Schema.decodeSync(SearchHolding);

const decodeMoney = Schema.decodeSync(MoneySchema);

const hexOf = (value: number, length: number): string =>
  Math.abs(value).toString(16).padStart(length, "0").slice(-length);

const holdingIdOf = (index: number): string =>
  `0192f0c1-${hexOf(index, 4)}-7${hexOf(index, 3)}-8${hexOf(index, 3)}-${hexOf(index * 7919, 12)}`;

const knownValue = (minor: number, currency: string): HoldingValue =>
  HoldingValueSchema.cases.Known.make({
    amount: decodeMoney({ currency, minor }),
    gain: GainSchema.cases.Unknown.make({ reason: "no-cost" }),
  });

const unknownValue = (
  reason: "no-price" | "no-rate" | "out-of-range"
): HoldingValue => HoldingValueSchema.cases.Unknown.make({ reason });

const holdingOf = (
  index: number,
  name: string,
  value: HoldingValue
): SearchHoldingValue =>
  decodeHolding({ holdingId: holdingIdOf(index), name, value });

const emptyPage: BankLinePage = {
  lines: [],
  next: Option.none(),
  total: 0,
};

const worldOf = (holdings: readonly SearchHoldingValue[]): SearchWorld => ({
  catalogue: [],
  holdings,
  merchants: [],
});

const variedCase = (text: string, roll: () => number): string => {
  let result = "";

  for (const letter of text) {
    result += roll() % 2 === 0 ? letter.toUpperCase() : letter.toLowerCase();
  }

  return result;
};

const padded = (roll: () => number): string => {
  const choice = roll() % 3;

  if (choice === 0) {
    return "";
  }

  return choice === 1 ? " " : "  ";
};

const signed = (roll: () => number): number => {
  const magnitude = roll() % 9_000_000_000_000;

  return roll() % 2 === 0 ? magnitude : -magnitude;
};

const generatedHoldings = (
  roll: () => number,
  caseIndex: number,
  value: () => HoldingValue
): readonly SearchHoldingValue[] => {
  const count = 1 + (roll() % 4);

  return Array.from({ length: count }, (_, slot) =>
    holdingOf(
      caseIndex * 10 + slot,
      `${pick(words, roll)} ${pick(words, roll)} ${String(caseIndex)}-${String(slot)}`,
      value()
    )
  );
};

const readyHoldings = (
  query: string,
  world: SearchWorld
): readonly SearchHoldingValue[] => {
  const findings = findingsOf(query, emptyPage, world);

  return Findings.guards.Ready(findings) ? findings.holdings : [];
};

it("the one box finds every portfolio holding by its name, in any letter case", () => {
  const roll = seeded(1);

  for (let index = 0; index < CASES; index += 1) {
    const holdings = generatedHoldings(roll, index, () =>
      knownValue(roll() % 1_000_000, pick(currencies, roll))
    );

    const target = holdings[roll() % holdings.length];

    if (target === undefined) {
      throw new Error("A generated world always carries a holding");
    }

    const query = `${padded(roll)}${variedCase(target.name, roll)}${padded(roll)}`;
    const found = readyHoldings(query, worldOf(holdings));

    expect(found.map((holding) => holding.holdingId)).toContain(
      target.holdingId
    );
  }
});

it("a search result never shows a holding whose name misses the query", () => {
  const roll = seeded(2);

  for (let index = 0; index < CASES; index += 1) {
    const holdings = generatedHoldings(roll, index, () =>
      unknownValue("no-price")
    );

    const source = holdings[roll() % holdings.length];

    if (source === undefined) {
      throw new Error("A generated world always carries a holding");
    }

    const start = roll() % source.name.length;

    const query = variedCase(
      source.name.slice(start, start + 1 + (roll() % 5)),
      roll
    );

    const needle = query.trim().toLowerCase();

    expect(
      readyHoldings(query, worldOf(holdings)).every((holding) =>
        holding.name.toLowerCase().includes(needle)
      )
    ).toBe(true);
  }
});

it("a known holding value is its exact money text, and zero only when the amount is zero", () => {
  const roll = seeded(3);

  for (let index = 0; index < CASES; index += 1) {
    const currency = pick(currencies, roll);
    const minor = index % 37 === 0 ? 0 : signed(roll);
    const text = holdingValueText(knownValue(minor, currency));

    expect(text).toBe(formatMinor(minor, currency));

    if (minor !== 0) {
      expect(text).not.toBe(formatMinor(0, currency));
    }
  }
});

it("an unknown holding value reads as a reason, never as an amount", () => {
  const reasons = ["no-price", "no-rate", "out-of-range"] as const;

  for (const reason of reasons) {
    expect(holdingValueText(unknownValue(reason))).not.toMatch(/[€£$¥\d]/u);
  }
});
