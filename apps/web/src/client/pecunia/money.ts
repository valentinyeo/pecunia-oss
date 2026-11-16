import { Schema } from "effect";

export const Currency = Schema.Literals(["EUR", "GBP", "USD"]);

export type CurrencyCode = typeof Currency.Type;

export const MinorUnits = Schema.Int.pipe(Schema.brand("MinorUnits"));

export type Minor = typeof MinorUnits.Type;

export const Money = Schema.Struct({
  amountMinor: MinorUnits,
  currency: Currency,
});

export type Amount = typeof Money.Type;

export const minorUnits = (amount: number): Minor =>
  Schema.decodeSync(MinorUnits)(amount);

export const totalMinor = (amounts: readonly Minor[]): Minor => {
  let total = 0;

  for (const amount of amounts) {
    total += amount;
  }

  return minorUnits(total);
};
