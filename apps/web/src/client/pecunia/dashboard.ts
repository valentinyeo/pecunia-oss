import { Schema } from "effect";

import { Currency, MinorUnits, Money } from "./money.js";

export const MonthLabel = Schema.Literals([
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]);

const Account = Schema.Struct({
  balance: Money,
  id: Schema.NonEmptyString.pipe(Schema.brand("AccountId")),
  kind: Schema.Literals(["brokerage", "current", "savings"]),
  name: Schema.NonEmptyString,
});

const NonNegativeMinorUnits = MinorUnits.check(
  Schema.isGreaterThanOrEqualTo(0)
);

const CategorySpend = Schema.Struct({
  category: Schema.NonEmptyString,
  spentMinor: NonNegativeMinorUnits,
});

const BalancePoint = Schema.Struct({
  balanceMinor: MinorUnits,
  month: MonthLabel,
});

const DashboardSummary = Schema.Struct({
  budgetLeftMinor: MinorUnits,
  incomeThisMonthMinor: NonNegativeMinorUnits,
  netWorthMinor: MinorUnits,
  spentThisMonthMinor: NonNegativeMinorUnits,
});

export const Dashboard = Schema.Struct({
  accounts: Schema.NonEmptyArray(Account),
  balanceTrend: Schema.NonEmptyArray(BalancePoint),
  currency: Currency,
  spendByCategory: Schema.NonEmptyArray(CategorySpend),
  summary: DashboardSummary,
});

export type DashboardData = typeof Dashboard.Type;
