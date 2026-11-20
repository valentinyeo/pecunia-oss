import { Schema } from "effect";

import type { DateOnly, EpochMillis } from "./model.js";
import { DateOnlySchema } from "./model.js";

export const MILLIS_PER_DAY = 86_400_000;

const CIVIL_EPOCH_OFFSET = 719_468;

const eraLength = 146_097;

const civilFromDays = (days: number): readonly [number, number, number] => {
  const shifted = days + CIVIL_EPOCH_OFFSET;
  const era = Math.floor(shifted / eraLength);
  const dayOfEra = shifted - era * eraLength;

  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365
  );

  const year = yearOfEra + era * 400;

  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));

  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart < 10 ? monthPart + 3 : monthPart - 9;

  return [month <= 2 ? year + 1 : year, month, day];
};

const daysFromCivil = (year: number, month: number, day: number): number => {
  const adjustedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month > 2 ? month - 3 : month + 9;

  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;

  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;

  return era * eraLength + dayOfEra - CIVIL_EPOCH_OFFSET;
};

const pad = (value: number, width: number): string =>
  value.toString().padStart(width, "0");

export const asOfOf = (epochMillis: EpochMillis | number): DateOnly => {
  const [year, month, day] = civilFromDays(
    Math.floor(Number(epochMillis) / MILLIS_PER_DAY)
  );

  return Schema.decodeSync(DateOnlySchema)(
    `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
  );
};

export const daysSinceEpochOf = (asOf: DateOnly): number => {
  const [year = 0, month = 0, day = 0] = asOf.split("-").map(Number);

  return daysFromCivil(year, month, day);
};

export const driftOf = (asOf: DateOnly, span: number): number => {
  const half = Math.floor(span / 2);

  const wrapped = ((daysSinceEpochOf(asOf) % span) + span) % span;

  return wrapped - half;
};
