import { pipe, Schema } from "effect";
import { Route } from "foldkit";
import { defineRouteUnion, literal } from "foldkit/route";

export const AppRoute = defineRouteUnion({
  Budgets: {},
  Dashboard: {},
  Investments: {},
  NotFound: { path: Schema.String },
  Settings: {},
  Subscriptions: {},
  Transactions: {},
});

export type AppRouteValue = typeof AppRoute.Type;

const appPath = literal("app");

export const dashboardRouter = pipe(appPath, Route.mapTo(AppRoute.Dashboard));

export const transactionsRouter = pipe(
  appPath,
  Route.slash(literal("transactions")),
  Route.mapTo(AppRoute.Transactions)
);

export const budgetsRouter = pipe(
  appPath,
  Route.slash(literal("budgets")),
  Route.mapTo(AppRoute.Budgets)
);

export const subscriptionsRouter = pipe(
  appPath,
  Route.slash(literal("subscriptions")),
  Route.mapTo(AppRoute.Subscriptions)
);

export const investmentsRouter = pipe(
  appPath,
  Route.slash(literal("investments")),
  Route.mapTo(AppRoute.Investments)
);

export const settingsRouter = pipe(
  appPath,
  Route.slash(literal("settings")),
  Route.mapTo(AppRoute.Settings)
);

export const parseRoute = Route.parseUrlWithFallback(
  Route.oneOf(
    transactionsRouter,
    budgetsRouter,
    subscriptionsRouter,
    investmentsRouter,
    settingsRouter,
    dashboardRouter
  ),
  AppRoute.NotFound
);
