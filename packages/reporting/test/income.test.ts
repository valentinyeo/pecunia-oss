import { expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import { countedFlows, flowsOf, totalsOf } from "../src/flows.js";
import { incomeRowsOf } from "../src/income.js";
import type { LineSeed } from "./fixtures.js";
import {
  CASES,
  currencyOf,
  monthOf,
  payeeIdOf,
  payeeOf,
  seeded,
  transactionOf,
  uuidOf,
} from "./fixtures.js";

const draw = seeded(9_191_919);

const clientA = uuidOf(700);

const clientB = uuidOf(701);

const payees = new Map<string, string>([
  [clientA, "Example Ltd"],
  [clientB, "Example Studio"],
]);

const months = ["2024-02", "2024-03", "2024-04"].map(monthOf);

const incomeLine = (
  id: number,
  clientPayeeId: string,
  minor: number,
  merchant: string,
  valueDate: string
): LineSeed => ({
  classification: "Income",
  clientPayeeId,
  direction: "in",
  id,
  merchant,
  minor,
  valueDate,
});

const randomBook = (size: number): readonly LineSeed[] =>
  Array.from({ length: size }, (_, index) => {
    const client = draw(2) === 0 ? clientA : clientB;

    return incomeLine(
      index + 1,
      client,
      draw(300_000),
      `Example merchant ${draw(5)}`,
      `2024-0${2 + draw(3)}-${String(1 + draw(28)).padStart(2, "0")}`
    );
  });

it.effect(
  "income is grouped by the client on the reference, never by the merchant",
  () =>
    Effect.gen(function* merchantIsNotAClient() {
      for (let index = 0; index < CASES; index += 1) {
        const lines = randomBook(6);

        const first = yield* incomeRowsOf(
          countedFlows(
            yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"))
          ),
          payees,
          [...months],
          Option.none()
        );

        const renamed = lines.map((line) => ({
          ...line,
          merchant: `Unrelated merchant ${draw(9)}`,
        }));

        const second = yield* incomeRowsOf(
          countedFlows(
            yield* flowsOf(renamed.map(transactionOf), currencyOf("EUR"))
          ),
          payees,
          [...months],
          Option.none()
        );

        expect(second).toStrictEqual(first);
      }
    })
);

it.effect(
  "a refund is money in but never income, and each client has its own total",
  () =>
    Effect.gen(function* refundsStayApart() {
      const lines: readonly LineSeed[] = [
        incomeLine(1, clientA, 100_000, "Example Ltd", "2024-03-02"),
        incomeLine(2, clientB, 50_000, "Example Studio", "2024-03-03"),
        {
          classification: "Refund",
          clientPayeeId: clientA,
          direction: "in",
          id: 3,
          merchant: "Demo Market",
          minor: 2500,
          valueDate: "2024-03-04",
        },
      ];

      const flows = countedFlows(
        yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"))
      );

      const rows = yield* incomeRowsOf(
        flows,
        payees,
        [...months],
        Option.none()
      );

      const totals = yield* totalsOf(flows, currencyOf("EUR"));

      expect(rows.map((row) => row.client.payeeId)).toStrictEqual([
        clientA,
        clientB,
      ]);
      expect(rows[0]?.incomeMinor).toBe(100_000);
      expect(rows[1]?.incomeMinor).toBe(50_000);
      expect(rows.reduce((total, row) => total + row.incomeMinor, 0)).toBe(
        totals.incomeMinor
      );
      expect(totals.refundMinor).toBe(2500);
      expect(totals.moneyInMinor).toBe(152_500);
    })
);

it.effect(
  "the monthly series is dense and adds up to the client's income",
  () =>
    Effect.gen(function* denseSeries() {
      const lines: readonly LineSeed[] = [
        incomeLine(1, clientA, 70_000, "Example Ltd", "2024-02-11"),
        incomeLine(2, clientA, 30_000, "Example Ltd", "2024-04-11"),
      ];

      const rows = yield* incomeRowsOf(
        countedFlows(
          yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"))
        ),
        payees,
        [...months],
        Option.none()
      );

      expect(rows[0]?.months.map((month) => month.month)).toStrictEqual([
        "2024-02",
        "2024-03",
        "2024-04",
      ]);
      expect(rows[0]?.months.map((month) => month.incomeMinor)).toStrictEqual([
        70_000, 0, 30_000,
      ]);
    })
);

it.effect("narrowing to one client keeps only that client's rows", () =>
  Effect.gen(function* narrowClient() {
    const lines: readonly LineSeed[] = [
      incomeLine(1, clientA, 70_000, "Example Ltd", "2024-03-11"),
      incomeLine(2, clientB, 30_000, "Example Studio", "2024-03-12"),
    ];

    const flows = countedFlows(
      yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"))
    );

    const rows = yield* incomeRowsOf(
      flows,
      payees,
      [...months],
      Option.some(payeeIdOf(clientB))
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.client.name).toBe("Example Studio");
    expect(rows[0]?.incomeMinor).toBe(30_000);
    expect(rows[0]?.shareBasisPoints).toBe(10_000);
  })
);

it.effect("an unknown client is refused by name", () =>
  Effect.gen(function* refuseUnknownClient() {
    const flows = countedFlows(
      yield* flowsOf(
        [
          transactionOf(
            incomeLine(1, uuidOf(999), 100, "Ghost Ltd", "2024-03-11")
          ),
        ],
        currencyOf("EUR")
      )
    );

    const failure = yield* incomeRowsOf(
      flows,
      payees,
      [...months],
      Option.none()
    ).pipe(Effect.flip);

    expect(failure._tag).toBe("UnknownClient");

    const filtered = yield* incomeRowsOf(
      flows,
      new Map([[uuidOf(999), "Ghost Ltd"]]),
      [...months],
      Option.some(payeeIdOf(uuidOf(999)))
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.client.name).toBe("Ghost Ltd");
    expect(payeeOf(uuidOf(999), "Ghost Ltd").name).toBe("Ghost Ltd");
  })
);
