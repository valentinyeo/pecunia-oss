import { Schema } from "effect";

export const MinorUnitsSchema = Schema.Int.check(
  Schema.makeFilter(Number.isSafeInteger, {
    expected: "an integer a number holds exactly",
  })
).pipe(Schema.brand("MinorUnits"));

export type MinorUnits = typeof MinorUnitsSchema.Type;

const trimmedNameCheck = Schema.makeFilter(
  (name: string) => name.trim().length > 0,
  { expected: "text with a visible character" }
);

export const DisplayNameSchema = Schema.NonEmptyString.check(trimmedNameCheck);

export type DisplayName = typeof DisplayNameSchema.Type;
