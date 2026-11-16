import { Schema } from "effect";

import { Dashboard } from "./dashboard.js";
import { minorUnits, totalMinor } from "./money.js";

type DashboardEncoded = Schema.Codec.Encoded<typeof Dashboard>;

const accounts = [
  {
    balance: { amountMinor: minorUnits(128_450), currency: "GBP" },
    id: "demo-bank-current",
    kind: "current",
    name: "Demo Bank Current",
  },
  {
    balance: { amountMinor: minorUnits(1_842_500), currency: "GBP" },
    id: "demo-bank-savings",
    kind: "savings",
    name: "Demo Bank Savings",
  },
  {
    balance: { amountMinor: minorUnits(2_854_050), currency: "GBP" },
    id: "example-ltd-brokerage",
    kind: "brokerage",
    name: "Example Ltd Brokerage",
  },
] satisfies DashboardEncoded["accounts"];

const spendByCategory = [
  { category: "Rent", spentMinor: minorUnits(145_000) },
  { category: "Groceries", spentMinor: minorUnits(41_260) },
  { category: "Transport", spentMinor: minorUnits(18_740) },
  { category: "Eating out", spentMinor: minorUnits(12_350) },
  { category: "Utilities", spentMinor: minorUnits(9600) },
  { category: "Everything else", spentMinor: minorUnits(4897) },
] satisfies DashboardEncoded["spendByCategory"];

const netWorthMinor = totalMinor(
  accounts.map((account) => account.balance.amountMinor)
);

const spentThisMonthMinor = totalMinor(
  spendByCategory.map((row) => row.spentMinor)
);

const monthlyBudgetMinor = minorUnits(320_000);

const demo = {
  accounts,
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
    { balanceMinor: netWorthMinor, month: "Dec" },
  ],
  currency: "GBP",
  spendByCategory,
  summary: {
    budgetLeftMinor: minorUnits(monthlyBudgetMinor - spentThisMonthMinor),
    incomeThisMonthMinor: minorUnits(410_000),
    netWorthMinor,
    spentThisMonthMinor,
  },
} satisfies DashboardEncoded;

export const demoDashboard = Schema.decodeSync(Dashboard)(demo);
