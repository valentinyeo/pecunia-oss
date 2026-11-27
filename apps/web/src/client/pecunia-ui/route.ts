import { Route } from "@effect/ui";

export const PecuniaRoute = Route.union({
  Aliases: Route.make("/app/aliases"),
  Budgets: Route.make("/app/budgets"),
  Categories: Route.make("/app/categories"),
  Dashboard: Route.make("/app"),
  Income: Route.make("/app/income"),
  Investments: Route.make("/app/investments"),
  Merchants: Route.make("/app/merchants"),
  Months: Route.make("/app/months"),
  NotFound: Route.make("/*"),
  Review: Route.make("/app/review"),
  Rules: Route.make("/app/rules"),
  Search: Route.make("/app/search"),
  Settings: Route.make("/app/settings"),
  Spending: Route.make("/app/spending"),
  Subscriptions: Route.make("/app/subscriptions"),
  Transactions: Route.make("/app/transactions"),
});

export type PecuniaRouteValue = typeof PecuniaRoute.Type;

export interface NavItem {
  readonly label: string;
  readonly route: PecuniaRouteValue;
  readonly section: "Account" | "Analytics" | "Money" | "Sorting";
}

export const navItems: readonly NavItem[] = [
  { label: "Dashboard", route: PecuniaRoute.Dashboard(), section: "Money" },
  {
    label: "Transactions",
    route: PecuniaRoute.Transactions(),
    section: "Money",
  },
  { label: "Review", route: PecuniaRoute.Review(), section: "Money" },
  {
    label: "Subscriptions",
    route: PecuniaRoute.Subscriptions(),
    section: "Money",
  },
  {
    label: "Investments",
    route: PecuniaRoute.Investments(),
    section: "Money",
  },
  { label: "Spending", route: PecuniaRoute.Spending(), section: "Analytics" },
  { label: "Income", route: PecuniaRoute.Income(), section: "Analytics" },
  { label: "Monthly", route: PecuniaRoute.Months(), section: "Analytics" },
  { label: "Categories", route: PecuniaRoute.Categories(), section: "Sorting" },
  { label: "Rules", route: PecuniaRoute.Rules(), section: "Sorting" },
  { label: "Aliases", route: PecuniaRoute.Aliases(), section: "Sorting" },
  { label: "Merchants", route: PecuniaRoute.Merchants(), section: "Sorting" },
  { label: "Settings", route: PecuniaRoute.Settings(), section: "Account" },
];

export const navSections = [
  "Money",
  "Analytics",
  "Sorting",
  "Account",
] as const;

export const routeTitle = (route: PecuniaRouteValue): string =>
  PecuniaRoute.match(route, {
    Aliases: () => "Aliases",
    Budgets: () => "Budgets",
    Categories: () => "Categories",
    Dashboard: () => "Dashboard",
    Income: () => "Income",
    Investments: () => "Investments",
    Merchants: () => "Merchants",
    Months: () => "Monthly",
    NotFound: () => "Page not found",
    Review: () => "Review",
    Rules: () => "Rules",
    Search: () => "Search",
    Settings: () => "Settings",
    Spending: () => "Spending",
    Subscriptions: () => "Subscriptions",
    Transactions: () => "Transactions",
  });
