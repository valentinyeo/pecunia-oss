import { Effect } from "effect";

import { monthLength, monthOfDate, startOfMonth, ordinalOf } from "./date.js";
import type { ReportOverflow } from "./errors.js";
import type { DateOnly, Forecast, MinorUnits, YearMonth } from "./model.js";
import { ForecastSchema } from "./model.js";
import { minorOrOverflow, roundHalfAwayFromZero } from "./money.js";

export const forecastOf = (
  month: YearMonth,
  today: DateOnly,
  spendMinor: MinorUnits
): Effect.Effect<Forecast, ReportOverflow> =>
  Effect.gen(function* forecastOfMonth() {
    const current = monthOfDate(today);

    if (current < month) {
      return ForecastSchema.cases.Pending.make({ month });
    }

    if (current > month) {
      return ForecastSchema.cases.Closed.make({ month, spendMinor });
    }

    const elapsedDays = ordinalOf(today) - ordinalOf(startOfMonth(month)) + 1;
    const totalDays = monthLength(month);

    const projected = roundHalfAwayFromZero(
      BigInt(spendMinor) * BigInt(totalDays),
      BigInt(elapsedDays)
    );

    return ForecastSchema.cases.Running.make({
      averageDailyMinor: yield* minorOrOverflow(
        roundHalfAwayFromZero(BigInt(spendMinor), BigInt(elapsedDays)),
        `average daily spend in ${month}`
      ),
      elapsedDays,
      month,
      projectedRemainderMinor: yield* minorOrOverflow(
        projected - BigInt(spendMinor),
        `projected spend left in ${month}`
      ),
      projectedSpendMinor: yield* minorOrOverflow(
        projected,
        `projected spend in ${month}`
      ),
      spendMinor,
      totalDays,
    });
  });
