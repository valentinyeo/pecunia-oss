import type { CategoryReference, PeriodChoice } from "@pecunia/reporting";
import { PeriodChoiceSchema } from "@pecunia/reporting";
import { Match, Schema } from "effect";

export const PeriodPresetSchema = Schema.Literals([
  "All",
  "Year",
  "Quarter",
  "Month",
  "Week",
  "Day",
]);

export type PeriodPreset = typeof PeriodPresetSchema.Type;

export const allPeriodPresets: readonly {
  readonly id: PeriodPreset;
  readonly label: string;
}[] = [
  { id: "All", label: "All time" },
  { id: "Year", label: "Year" },
  { id: "Quarter", label: "Quarter" },
  { id: "Month", label: "Month" },
  { id: "Week", label: "Week" },
  { id: "Day", label: "Today" },
];

export const reportPeriodPresets: readonly {
  readonly id: PeriodPreset;
  readonly label: string;
}[] = [
  { id: "All", label: "All time" },
  { id: "Year", label: "Year" },
  { id: "Quarter", label: "Quarter" },
  { id: "Month", label: "Month" },
];

export const periodChoiceOf = (preset: PeriodPreset): PeriodChoice =>
  Match.value(preset).pipe(
    Match.when("All", () => PeriodChoiceSchema.cases.All.make({})),
    Match.when("Year", () => PeriodChoiceSchema.cases.Year.make({})),
    Match.when("Quarter", () => PeriodChoiceSchema.cases.Quarter.make({})),
    Match.when("Month", () => PeriodChoiceSchema.cases.Month.make({})),
    Match.when("Week", () => PeriodChoiceSchema.cases.Week.make({})),
    Match.when("Day", () => PeriodChoiceSchema.cases.Day.make({})),
    Match.exhaustive
  );

export const categoryLabelOf = (category: CategoryReference): string =>
  Match.value(category).pipe(
    Match.tags({
      Categorised: ({ name }) => name,
      Uncategorised: () => "Uncategorised",
    }),
    Match.exhaustive
  );

export const sharePercentOf = (basisPoints: number): string =>
  `${(basisPoints / 100).toFixed(1)}%`;

export const formatQuantityMicros = (micros: number): string => {
  const whole = Math.trunc(micros / 1_000_000);
  const fraction = Math.abs(micros % 1_000_000);

  if (fraction === 0) {
    return String(whole);
  }

  return `${whole}.${String(fraction).padStart(6, "0").replace(/0+$/u, "")}`;
};

export const parseQuantityMicros = (text: string): number | null => {
  const trimmed = text.trim();

  if (!/^\d+(?:\.\d{1,6})?$/u.test(trimmed)) {
    return null;
  }

  const [whole = "0", fraction = ""] = trimmed.split(".");
  const micros = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));

  return Number.isSafeInteger(micros) && micros >= 0 ? micros : null;
};

export const parseMajorToMinor = (text: string): number | null => {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return null;
  }

  if (!/^\d+(?:\.\d{1,2})?$/u.test(trimmed)) {
    return null;
  }

  const [whole = "0", fraction = ""] = trimmed.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));

  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
};
