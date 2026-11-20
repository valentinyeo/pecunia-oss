import {
  AppRoute,
  aliasesRouter,
  budgetsRouter,
  categoriesRouter,
  dashboardRouter,
  investmentsRouter,
  merchantsRouter,
  rulesRouter,
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

const sortingSection: MenuSection = {
  heading: "Sorting",
  items: [
    {
      label: "Categories",
      path: categoriesRouter(),
      screen: AppRoute.Categories(),
    },
    { label: "Rules", path: rulesRouter(), screen: AppRoute.Rules() },
    { label: "Aliases", path: aliasesRouter(), screen: AppRoute.Aliases() },
    {
      label: "Merchants",
      path: merchantsRouter(),
      screen: AppRoute.Merchants(),
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
  sortingSection,
  accountSection,
];

export const isCurrent = (route: AppRouteValue, item: MenuItem): boolean =>
  route._tag === item.screen._tag;

export const routeTitle = AppRoute.match({
  Aliases: () => "Aliases",
  Budgets: () => "Budgets",
  Categories: () => "Categories",
  Dashboard: () => "Dashboard",
  Investments: () => "Investments",
  MerchantDetail: () => "Merchant",
  Merchants: () => "Merchants",
  NotFound: () => "Not found",
  Rules: () => "Rules",
  Settings: () => "Settings",
  Subscriptions: () => "Subscriptions",
  Transactions: () => "Transactions",
});
