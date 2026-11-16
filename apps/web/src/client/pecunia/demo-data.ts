import { Schema } from "effect";

import { Dashboard } from "./dashboard.js";

const demo = {
  accounts: [
    {
      balance: { amountMinor: 128_450, currency: "GBP" },
      id: "demo-bank-current",
      kind: "current",
      name: "Demo Bank Current",
    },
    {
      balance: { amountMinor: 1_842_500, currency: "GBP" },
      id: "demo-bank-savings",
      kind: "savings",
      name: "Demo Bank Savings",
    },
    {
      balance: { amountMinor: 2_854_050, currency: "GBP" },
      id: "example-ltd-brokerage",
      kind: "brokerage",
      name: "Example Ltd Brokerage",
    },
    {
      balance: { amountMinor: 214_000, currency: "EUR" },
      id: "demo-bank-euro",
      kind: "current",
      name: "Demo Bank Euro",
    },
  ],
  balanceTrend: [
    { balanceMinor: 3_512_000, month: "Jan" },
    { balanceMinor: 3_648_000, month: "Feb" },
    { balanceMinor: 3_580_000, month: "Mar" },
    { balanceMinor: 3_712_500, month: "Apr" },
    { balanceMinor: 3_860_000, month: "May" },
    { balanceMinor: 3_805_000, month: "Jun" },
    { balanceMinor: 4_020_000, month: "Jul" },
    { balanceMinor: 4_155_000, month: "Aug" },
    { balanceMinor: 4_098_000, month: "Sep" },
    { balanceMinor: 4_402_000, month: "Oct" },
    { balanceMinor: 4_687_500, month: "Nov" },
    { balanceMinor: 4_825_000, month: "Dec" },
  ],
  currency: "GBP",
  spendByCategory: [
    { category: "Rent", spentMinor: 145_000 },
    { category: "Groceries", spentMinor: 41_260 },
    { category: "Transport", spentMinor: 18_740 },
    { category: "Eating out", spentMinor: 12_350 },
    { category: "Utilities", spentMinor: 9600 },
    { category: "Everything else", spentMinor: 4897 },
  ],
  summary: {
    budgetLeftMinor: 88_153,
    incomeThisMonthMinor: 410_000,
    netWorthMinor: 4_825_000,
    spentThisMonthMinor: 231_847,
  },
} satisfies Schema.Codec.Encoded<typeof Dashboard>;

export const demoDashboard = Schema.decodeSync(Dashboard)(demo);
