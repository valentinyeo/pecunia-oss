import { Match, Schema } from "effect";

import { shiftDays, shiftMonths } from "./civil.js";
import { DateOnlySchema, FREQUENCIES } from "./model.js";
import type { DateOnly, Frequency } from "./model.js";

export const CHARGES_PER_YEAR: Readonly<Record<Frequency, number>> = {
  annual: 1,
  monthly: 12,
  quarterly: 4,
  weekly: 52,
};

export const chargesPerYearOf = (frequency: Frequency): number =>
  CHARGES_PER_YEAR[frequency];

const dateOnly = Schema.decodeSync(DateOnlySchema);

export const nextChargeOn = (
  lastChargedOn: DateOnly,
  frequency: Frequency
): DateOnly =>
  dateOnly(
    Match.value(frequency).pipe(
      Match.when("weekly", () => shiftDays(lastChargedOn, 7)),
      Match.when("monthly", () => shiftMonths(lastChargedOn, 1)),
      Match.when("quarterly", () => shiftMonths(lastChargedOn, 3)),
      Match.when("annual", () => shiftMonths(lastChargedOn, 12)),
      Match.exhaustive
    )
  );

export const NOMINAL_DAYS: Readonly<Record<Frequency, number>> = {
  annual: 365,
  monthly: 30,
  quarterly: 92,
  weekly: 7,
};

export const FREQUENCY_BANDS: Readonly<
  Record<Frequency, { readonly max: number; readonly min: number }>
> = {
  annual: { max: 380, min: 350 },
  monthly: { max: 35, min: 25 },
  quarterly: { max: 100, min: 80 },
  weekly: { max: 9, min: 5 },
};

export const frequencyOfInterval = (days: number): Frequency | undefined =>
  FREQUENCIES.find((frequency) => {
    const band = FREQUENCY_BANDS[frequency];

    return days >= band.min && days <= band.max;
  });
