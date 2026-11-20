import { pipe, Schema } from "effect";
import { Route } from "foldkit";
import { defineRouteUnion, literal } from "foldkit/route";

export const AppRoute = defineRouteUnion({
  Aliases: {},
  Budgets: {},
  Categories: {},
  Dashboard: {},
  Investments: {},
  MerchantDetail: { key: Schema.String },
  Merchants: {},
  NotFound: { path: Schema.String },
  Rules: {},
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

export const categoriesRouter = pipe(
  appPath,
  Route.slash(literal("categories")),
  Route.mapTo(AppRoute.Categories)
);

export const rulesRouter = pipe(
  appPath,
  Route.slash(literal("rules")),
  Route.mapTo(AppRoute.Rules)
);

export const aliasesRouter = pipe(
  appPath,
  Route.slash(literal("aliases")),
  Route.mapTo(AppRoute.Aliases)
);

export const merchantsRouter = pipe(
  appPath,
  Route.slash(literal("merchants")),
  Route.mapTo(AppRoute.Merchants)
);

export const merchantDetailRouter = pipe(
  appPath,
  Route.slash(literal("merchants")),
  Route.slash(Route.string("key")),
  Route.mapTo(AppRoute.MerchantDetail)
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
    categoriesRouter,
    rulesRouter,
    aliasesRouter,
    merchantDetailRouter,
    merchantsRouter,
    dashboardRouter
  ),
  AppRoute.NotFound
);
