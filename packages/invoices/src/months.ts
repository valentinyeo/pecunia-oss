import { Schema } from "effect";

import type { DateOnly, Month } from "./model.js";
import { MonthSchema } from "./model.js";

export const monthOf = (date: DateOnly): Month =>
  Schema.decodeSync(MonthSchema)(date.slice(0, 7));

export const compareMonths = (left: Month, right: Month): number => {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
};
