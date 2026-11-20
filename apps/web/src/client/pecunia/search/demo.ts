import { demoBankLines } from "@pecunia/bank-lines/demo";
import {
  CurrencyCodeSchema,
  MinorUnitsSchema,
} from "@pecunia/bank-lines/model";
import { Schema } from "effect";

export const HoldingIdSchema = Schema.NonEmptyString.check(
  Schema.isMaxLength(64)
).pipe(Schema.brand("HoldingId"));

export type HoldingId = typeof HoldingIdSchema.Type;

export const Holding = Schema.Struct({
  id: HoldingIdSchema,
  name: Schema.NonEmptyString,
  value: Schema.Struct({
    currency: CurrencyCodeSchema,
    minor: MinorUnitsSchema,
  }),
});

export type HoldingValue = typeof Holding.Type;

export const demoHoldings: readonly HoldingValue[] = Schema.decodeSync(
  Schema.Array(Holding)
)([
  {
    id: "demo-holding-brokerage",
    name: "Example Ltd Brokerage",
    value: { currency: "GBP", minor: 2_854_050 },
  },
  {
    id: "demo-holding-pension",
    name: "Demo Pension",
    value: { currency: "GBP", minor: 4_120_000 },
  },
  {
    id: "demo-holding-isa",
    name: "Demo Shares ISA",
    value: { currency: "GBP", minor: 960_000 },
  },
]);

export const demoMerchants: readonly string[] = [
  ...new Set(
    demoBankLines.flatMap((line) =>
      line.raw.merchant === "" ? [] : [line.raw.merchant]
    )
  ),
].toSorted();
