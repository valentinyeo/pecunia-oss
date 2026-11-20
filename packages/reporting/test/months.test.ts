import { expect, it } from "@effect/vitest";
import { Effect, Predicate } from "effect";

import {
  boundOf,
  monthBound,
  monthLength,
  monthsOfBound,
} from "../src/date.js";
import {
  countedFlows,
  flowsIn,
  flowsOf,
  monthTotalsOf,
  monthsHeld,
  totalsOf,
} from "../src/flows.js";
import { forecastOf } from "../src/forecast.js";
import { merchantRowsOf, repeatPaymentsOf } from "../src/merchants.js";
import { ForecastSchema } from "../src/model.js";
import { roundHalfAwayFromZero } from "../src/money.js";
import type { LineSeed } from "./fixtures.js";
import {
  CASES,
  currencyOf,
  dateOf,
  minorUnits,
  monthOf,
  seeded,
  transactionOf,
} from "./fixtures.js";

const draw = seeded(77_777);

const pad = (value: number): string => String(value).padStart(2, "0");

const spendLine = (
  id: number,
  merchant: string,
  minor: number,
  valueDate: string
): LineSeed => ({
  direction: "out",
  id,
  merchant,
  minor,
  valueDate,
});

it.effect(
  "a running month projects the rest from the days elapsed, exactly",
  () =>
    Effect.gen(function* forecastFormula() {
      for (let index = 0; index < CASES; index += 1) {
        const month = monthOf(`2024-${pad(1 + draw(12))}`);
        const totalDays = monthLength(month);
        const day = 1 + draw(totalDays);
        const today = dateOf(`${month}-${pad(day)}`);
        const spend = draw(2_000_000) - 500_000;
        const forecast = yield* forecastOf(month, today, minorUnits(spend));

        expect(forecast._tag).toBe("Running");

        if (Predicate.isTagged(forecast, "Running")) {
          expect(forecast.elapsedDays).toBe(day);
          expect(forecast.totalDays).toBe(totalDays);
          expect(forecast.spendMinor).toBe(spend);
          expect(forecast.projectedSpendMinor).toBe(
            Number(
              roundHalfAwayFromZero(
                BigInt(spend) * BigInt(totalDays),
                BigInt(day)
              )
            )
          );
          expect(forecast.projectedRemainderMinor).toBe(
            forecast.projectedSpendMinor - spend
          );
        }
      }
    })
);

it.effect("the last day of a month projects exactly the spend it saw", () =>
  Effect.gen(function* lastDayIsExact() {
    const month = monthOf("2024-02");

    const forecast = yield* forecastOf(
      month,
      dateOf("2024-02-29"),
      minorUnits(123_456)
    );

    expect(forecast).toStrictEqual(
      ForecastSchema.cases.Running.make({
        averageDailyMinor: minorUnits(Math.round(123_456 / 29)),
        elapsedDays: 29,
        month,
        projectedRemainderMinor: minorUnits(0),
        projectedSpendMinor: minorUnits(123_456),
        spendMinor: minorUnits(123_456),
        totalDays: 29,
      })
    );
  })
);

it.effect(
  "a month that has not started is pending, and one that ended is closed",
  () =>
    Effect.gen(function* forecastStates() {
      const pending = yield* forecastOf(
        monthOf("2024-05"),
        dateOf("2024-03-15"),
        minorUnits(1000)
      );

      const closed = yield* forecastOf(
        monthOf("2024-02"),
        dateOf("2024-03-15"),
        minorUnits(1000)
      );

      expect(pending._tag).toBe("Pending");
      expect(closed._tag).toBe("Closed");

      if (Predicate.isTagged(closed, "Closed")) {
        expect(closed.spendMinor).toBe(1000);
      }
    })
);

it.effect("the months a book holds are listed once each, newest first", () =>
  Effect.gen(function* monthsListed() {
    const lines: readonly LineSeed[] = [
      spendLine(1, "Demo Market", 100, "2024-01-10"),
      spendLine(2, "Demo Market", 100, "2024-03-10"),
      spendLine(3, "Demo Market", 100, "2024-03-11"),
      spendLine(4, "Demo Market", 100, "2024-02-10"),
      {
        ...spendLine(5, "Demo Market", 100, "2024-04-10"),
        status: "pending" as const,
      },
    ];

    const flows = yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"));

    expect(monthsHeld(flows)).toStrictEqual(["2024-03", "2024-02", "2024-01"]);
  })
);

it.effect(
  "month by month totals are dense and each one matches its own month",
  () =>
    Effect.gen(function* monthlyTotals() {
      const lines: readonly LineSeed[] = [
        spendLine(1, "Demo Market", 15_000, "2024-02-10"),
        spendLine(2, "Demo Lettings", 45_000, "2024-03-03"),
        {
          classification: "Income",
          clientPayeeId: "0192f0c1-0700-7abc-8def-000000000001",
          direction: "in",
          id: 3,
          minor: 150_000,
          valueDate: "2024-03-02",
        },
      ];

      const flows = yield* flowsOf(lines.map(transactionOf), currencyOf("EUR"));
      const bound = monthBound(monthOf("2024-01"));

      const months = monthsOfBound(
        boundOf(dateOf("2024-01-01"), dateOf("2024-03-31"))
      );

      const totals = yield* monthTotalsOf(flows, currencyOf("EUR"), months);
      const january = yield* totalsOf(flowsIn(flows, bound), currencyOf("EUR"));

      expect(months).toStrictEqual(["2024-01", "2024-02", "2024-03"]);
      expect(totals.map((row) => row.month)).toStrictEqual(months);
      expect(totals[0]?.totals).toStrictEqual(january);
      expect(totals[1]?.totals.moneyOutMinor).toBe(15_000);
      expect(totals[2]?.totals).toStrictEqual(
        yield* totalsOf(
          flowsIn(flows, monthBound(monthOf("2024-03"))),
          currencyOf("EUR")
        )
      );
    })
);

it.effect(
  "top merchants are ranked by spend and repeat payments only list merchants paid twice",
  () =>
    Effect.gen(function* merchantRanking() {
      const flows = countedFlows(
        yield* flowsOf(
          [
            spendLine(1, "Demo Market", 5000, "2024-03-02"),
            spendLine(2, "Demo Market", 4000, "2024-03-03"),
            spendLine(3, "Demo Market", 3000, "2024-03-04"),
            spendLine(4, "Demo Lettings", 45_000, "2024-03-05"),
            spendLine(5, "Demo Transit", 2000, "2024-03-06"),
          ].map(transactionOf),
          currencyOf("EUR")
        )
      );

      const merchants = yield* merchantRowsOf(flows, 5);
      const repeats = yield* repeatPaymentsOf(flows, 5);

      expect(merchants.map((row) => row.merchant)).toStrictEqual([
        "Demo Lettings",
        "Demo Market",
        "Demo Transit",
      ]);
      expect(merchants[1]?.repeatCount).toBe(3);
      expect(merchants[1]?.spendMinor).toBe(12_000);
      expect(repeats).toStrictEqual([
        {
          merchant: "Demo Market",
          payments: 3,
          spendMinor: minorUnits(12_000),
        },
      ]);
    })
);
