import { Option, Predicate } from "effect";

import {
  AppRoute,
  budgetsRouter,
  dashboardRouter,
  investmentsRouter,
  reviewRouter,
  searchRouter,
  settingsRouter,
  subscriptionsRouter,
  transactionsRouter,
} from "../../client/pecunia/route.js";
import type { AppRouteValue } from "../../client/pecunia/route.js";

export type MenuItem = Readonly<{
  label: string;
  path: string;
  screen: AppRouteValue;
}>;

export type MenuSection = Readonly<{
  heading: string;
  items: readonly MenuItem[];
}>;

const moneySection: MenuSection = {
  heading: "Money",
  items: [
    {
      label: "Dashboard",
      path: dashboardRouter(),
      screen: AppRoute.Dashboard(),
    },
    {
      label: "Transactions",
      path: transactionsRouter(),
      screen: AppRoute.Transactions(),
    },
    { label: "Review", path: reviewRouter(), screen: AppRoute.Review() },
    {
      label: "Search",
      path: searchRouter({ q: Option.none() }),
      screen: AppRoute.Search({ q: Option.none() }),
    },
    { label: "Budgets", path: budgetsRouter(), screen: AppRoute.Budgets() },
    {
      label: "Subscriptions",
      path: subscriptionsRouter(),
      screen: AppRoute.Subscriptions(),
    },
    {
      label: "Investments",
      path: investmentsRouter(),
      screen: AppRoute.Investments(),
    },
  ],
};

const accountSection: MenuSection = {
  heading: "Account",
  items: [
    { label: "Settings", path: settingsRouter(), screen: AppRoute.Settings() },
  ],
};

export const menuSections: readonly MenuSection[] = [
  moneySection,
  accountSection,
];

export const isCurrent = (route: AppRouteValue, item: MenuItem): boolean =>
  Predicate.isTagged(route, item.screen._tag) ||
  (Predicate.isTagged(item.screen, "Transactions") &&
    Predicate.isTagged(route, "Spending"));

export const routeTitle = AppRoute.match({
  Budgets: () => "Budgets",
  Dashboard: () => "Dashboard",
  Investments: () => "Investments",
  NotFound: () => "Not found",
  Review: () => "Review",
  Search: () => "Search",
  Settings: () => "Settings",
  Spending: () => "Spending",
  Subscriptions: () => "Subscriptions",
  Transactions: () => "Transactions",
});
