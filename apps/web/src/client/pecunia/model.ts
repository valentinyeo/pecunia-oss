import { demoPortfolio } from "@pecunia/investments/demo";
import { PortfolioSchema } from "@pecunia/investments/model";
import { Schema } from "effect";

import { Dashboard } from "./dashboard.js";
import { demoDashboard } from "./demo-data.js";
import { AppRoute } from "./route.js";

export const Theme = Schema.Literals(["dark", "light"]);

export type ThemeValue = typeof Theme.Type;

export const Model = Schema.Struct({
  dashboard: Dashboard,
  investments: PortfolioSchema,
  route: AppRoute,
  theme: Theme,
});

export type PecuniaModel = typeof Model.Type;

export const initialModel: PecuniaModel = {
  dashboard: demoDashboard,
  investments: demoPortfolio,
  route: AppRoute.Dashboard(),
  theme: "light",
};
