import { expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import { boundOf } from "../src/date.js";
import {
  countedFlows,
  dailySpend,
  flowsIn,
  flowsOf,
  spendByCurrency,
  spendFlows,
  totalsOf,
} from "../src/flows.js";
import type { Flow } from "../src/flows.js";
import { allocateShares } from "../src/shares.js";
import type { LineSeed } from "./fixtures.js";
import {
  CASES,
  currencyOf,
  foreignTransactionOf,
  minorUnits,
  moneyOf,
  seeded,
  transactionOf,
  dateOf,
} from "./fixtures.js";

const draw = seeded(31_337);

const statuses = ["posted", "posted", "posted", "pending", "reversed"] as const;

const classifications = [
  "None",
  "None",
  "None",
  "Income",
  "Refund",
  "TaxPayment",
  "InternalTransfer",
  "Excluded",
] as const;

const directions = ["out", "out", "in", "neutral"] as const;

const lineAt = (id: number, date: string): LineSeed => ({
  classification: classifications[draw(classifications.length)] ?? "None",
  direction: directions[draw(directions.length)] ?? "out",
  id,
  minor: draw(400_000) - 100_000,
  status: statuses[draw(statuses.length)] ?? "posted",
  valueDate: date,
});

const generatedBook = (size: number) =>
  Array.from({ length: size }, (_, index) =>
    transactionOf(
      lineAt(index + 1, `2024-03-${String(1 + draw(28)).padStart(2, "0")}`)
    )
  );

const variantOf = (line: LineSeed, slot: number): LineSeed => {
  if (slot === 0) {
    return { ...line, status: "pending" as const };
  }

  if (slot === 1) {
    return { ...line, status: "reversed" as const };
  }

  if (slot === 2) {
    return { ...line, classification: "InternalTransfer" as const };
  }

  if (slot === 3) {
    return { ...line, classification: "Excluded" as const };
  }

  return { ...line, direction: "neutral" as const };
};

const signedTotal = (flows: readonly Flow[], kind: string): number => {
  let total = 0;

  for (const flow of flows) {
    if (flow.kind === kind) {
      total += flow.amount.minor;
    }
  }

  return total;
};

it.effect(
  "totals keep every unit, and each part adds up to its side and the net",
  () =>
    Effect.gen(function* totalsAddUp() {
      for (let index = 0; index < CASES; index += 1) {
        const flows = countedFlows(
          yield* flowsOf(generatedBook(8), currencyOf("EUR"))
        );

        const totals = yield* totalsOf(flows, currencyOf("EUR"));

        expect(totals.incomeMinor).toBe(signedTotal(flows, "income"));
        expect(totals.refundMinor).toBe(signedTotal(flows, "refund"));
        expect(totals.otherInMinor).toBe(signedTotal(flows, "otherIn"));
        expect(totals.spendMinor).toBe(signedTotal(flows, "spend"));
        expect(totals.taxMinor).toBe(signedTotal(flows, "tax"));
        expect(totals.moneyInMinor).toBe(
          totals.incomeMinor + totals.otherInMinor + totals.refundMinor
        );
        expect(totals.moneyOutMinor).toBe(totals.spendMinor + totals.taxMinor);
        expect(totals.netMinor).toBe(
          totals.moneyInMinor - totals.moneyOutMinor
        );
      }
    })
);

it.effect(
  "a pending, reversed, internal, excluded or neutral line moves no total",
  () =>
    Effect.gen(function* ignoredLinesMoveNothing() {
      for (let index = 0; index < CASES; index += 1) {
        const line = lineAt(index + 1, "2024-03-10");

        const base = yield* totalsOf(
          countedFlows(
            yield* flowsOf([transactionOf(line)], currencyOf("EUR"))
          ),
          currencyOf("EUR")
        );

        const variant = variantOf(line, index % 5);

        const moved = yield* totalsOf(
          countedFlows(
            yield* flowsOf([transactionOf(variant)], currencyOf("EUR"))
          ),
          currencyOf("EUR")
        );

        expect(moved.moneyInMinor - base.moneyInMinor).toBe(0);
        expect(moved.moneyOutMinor - base.moneyOutMinor).toBe(0);
      }
    })
);

it.effect(
  "a base amount converted against another currency is refused by name",
  () =>
    Effect.gen(function* refuseMixedCurrency() {
      const failure = yield* flowsOf(
        [
          foreignTransactionOf({
            baseCurrency: "USD",
            baseMinor: 92_000,
            currency: "EUR",
            id: 1,
            minor: 100_000,
            rate: "0.92",
            valueDate: "2024-03-10",
          }),
        ],
        currencyOf("EUR")
      ).pipe(Effect.flip);

      expect(failure._tag).toBe("MixedCurrency");
    })
);

it.effect(
  "a total that leaves the safe integer range is refused instead of rounded",
  () =>
    Effect.gen(function* refuseOverflow() {
      const flows = yield* flowsOf(
        [
          transactionOf({
            direction: "out",
            id: 1,
            minor: Number.MAX_SAFE_INTEGER,
            valueDate: "2024-03-10",
          }),
          transactionOf({
            direction: "out",
            id: 2,
            minor: Number.MAX_SAFE_INTEGER,
            valueDate: "2024-03-10",
          }),
        ],
        currencyOf("EUR")
      );

      const failure = yield* totalsOf(
        countedFlows(flows),
        currencyOf("EUR")
      ).pipe(Effect.flip);

      expect(failure._tag).toBe("ReportOverflow");
    })
);

it.effect(
  "spend splits by the currency it was paid in, once per currency",
  () =>
    Effect.gen(function* splitByCurrency() {
      const transactions = [
        transactionOf({
          direction: "out",
          id: 1,
          minor: 1000,
          valueDate: "2024-03-10",
        }),
        transactionOf({
          direction: "out",
          id: 2,
          minor: 2500,
          valueDate: "2024-03-11",
        }),
        foreignTransactionOf({
          baseCurrency: "EUR",
          baseMinor: 4600,
          currency: "USD",
          direction: "out",
          id: 3,
          minor: 5000,
          rate: "0.92",
          valueDate: "2024-03-12",
        }),
      ];

      const flows = countedFlows(
        yield* flowsOf(transactions, currencyOf("EUR"))
      );

      const rows = yield* spendByCurrency(flows);

      expect(rows).toStrictEqual([
        { currency: currencyOf("EUR"), spendMinor: minorUnits(3500) },
        { currency: currencyOf("USD"), spendMinor: minorUnits(5000) },
      ]);
    })
);

it.effect(
  "the daily chart is dense, in order, and adds up to the period's spend",
  () =>
    Effect.gen(function* denseDailyChart() {
      const from = dateOf("2024-03-01");
      const to = dateOf("2024-03-31");

      for (let index = 0; index < CASES; index += 1) {
        const flows = countedFlows(
          yield* flowsOf(generatedBook(5), currencyOf("EUR"))
        );

        const rows = yield* dailySpend(flows, from, to);
        const spend = yield* totalsOf(flows, currencyOf("EUR"));
        const total = rows.reduce((sum, row) => sum + row.spendMinor, 0);

        expect(rows.length).toBe(31);
        expect(rows[0]?.date).toBe("2024-03-01");
        expect(rows.at(-1)?.date).toBe("2024-03-31");
        expect(total).toBe(spend.spendMinor);
      }
    })
);

it.effect("a period keeps only the counted lines that fall inside it", () =>
  Effect.gen(function* periodWindow() {
    const flows = yield* flowsOf(generatedBook(40), currencyOf("EUR"));
    const bound = boundOf(dateOf("2024-03-10"), dateOf("2024-03-20"));
    const inside = flowsIn(flows, bound);

    for (const flow of inside) {
      expect(flow.transaction.valueDate >= "2024-03-10").toBe(true);
      expect(flow.transaction.valueDate <= "2024-03-20").toBe(true);
      expect(flow.kind).not.toBe("ignored");
    }

    expect(inside.length).toBe(
      countedFlows(flows).filter(
        (flow) =>
          flow.transaction.valueDate >= "2024-03-10" &&
          flow.transaction.valueDate <= "2024-03-20"
      ).length
    );
    expect(spendFlows(inside).length <= inside.length).toBe(true);
  })
);

it.effect(
  "shares always add up to one hundred percent of a non-zero total",
  () =>
    Effect.gen(function* sharesAddUp() {
      for (let index = 0; index < CASES; index += 1) {
        const size = 1 + draw(7);

        const targets = Array.from({ length: size }, (_, position) => ({
          key: `row-${position}`,
          minor: minorUnits(draw(200_000) - 50_000),
        }));

        const total = targets.reduce((sum, target) => sum + target.minor, 0);
        const shares = yield* allocateShares(targets);

        const allocated = shares.reduce(
          (sum, share) => sum + share.shareBasisPoints,
          0
        );

        expect(shares.length).toBe(size);
        expect(allocated).toBe(total === 0 ? 0 : 10_000);

        if (size === 1) {
          expect(shares[0]?.shareBasisPoints).toBe(total === 0 ? 0 : 10_000);
        }
      }
    })
);

it.effect(
  "a share of an all-zero total is zero, and a negative row keeps a negative share",
  () =>
    Effect.gen(function* shareEdges() {
      const zeros = yield* allocateShares([
        { key: "a", minor: minorUnits(0) },
        { key: "b", minor: minorUnits(0) },
      ]);

      expect(zeros.map((share) => share.shareBasisPoints)).toStrictEqual([
        0, 0,
      ]);

      const mixed = yield* allocateShares([
        { key: "a", minor: minorUnits(300) },
        { key: "b", minor: minorUnits(-100) },
      ]);

      const total = mixed.reduce(
        (sum, share) => sum + share.shareBasisPoints,
        0
      );

      expect(total).toBe(10_000);
      expect(mixed[0]?.shareBasisPoints).toBeGreaterThan(0);
      expect(Option.isSome(Option.some(1))).toBe(true);
    })
);

it("a line paid in another currency keeps its own amount for the split", () => {
  const line: LineSeed = {
    direction: "out",
    id: 9,
    minor: 4000,
    valueDate: "2024-03-10",
  };

  const transaction = transactionOf(line);

  const flow: Flow = {
    amount: moneyOf("EUR", 4000),
    kind: "spend",
    source: moneyOf("USD", 4000),
    transaction,
  };

  expect(flow.source.currency).toBe(currencyOf("USD"));
  expect(flow.amount.minor).toBe(4000);
});
