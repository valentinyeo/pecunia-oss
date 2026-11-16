import { describe, expect, it } from "@effect/vitest";

import { demoDashboard } from "../src/client/pecunia/demo-data.js";

const months = [
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
] as const;

describe("demo dashboard data", () => {
  it("reports every account in the currency the dashboard is drawn in", () => {
    for (const account of demoDashboard.accounts) {
      expect(account.balance.currency).toBe(demoDashboard.currency);
    }
  });

  it("ends its balance trend at the net worth it reports", () => {
    const last = demoDashboard.balanceTrend.at(-1);

    expect(last?.balanceMinor).toBe(demoDashboard.summary.netWorthMinor);
  });

  it("walks the trend through each month of the year once, in order", () => {
    expect(
      demoDashboard.balanceTrend.map((point) => point.month)
    ).toStrictEqual([...months]);
  });

  it("keys every account and every category once", () => {
    const accountIds = demoDashboard.accounts.map((account) => account.id);
    const categories = demoDashboard.spendByCategory.map((row) => row.category);

    expect(new Set(accountIds).size).toBe(accountIds.length);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it("names only made-up banks and companies", () => {
    for (const account of demoDashboard.accounts) {
      expect(account.name).toMatch(/\b(?:Demo|Example)\b/u);
    }
  });
});
