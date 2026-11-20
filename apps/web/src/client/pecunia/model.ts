import { demoPortfolio } from "@pecunia/investments/demo";
import { PortfolioSchema } from "@pecunia/investments/model";
import { Schema } from "effect";

import { BankLinesScreen, initialBankLines } from "./bank-lines/model.js";
import { CategorizeScreen, initialCategorize } from "./categorize/model.js";
import { Dashboard } from "./dashboard.js";
import { demoDashboard } from "./demo-data.js";
import { AppRoute } from "./route.js";
import { initialSearch, SearchModel } from "./search/model.js";
import {
  initialSettings,
  SettingsRole,
  SettingsScreen,
} from "./settings/model.js";

export const Theme = Schema.Literals(["dark", "light"]);

export type ThemeValue = typeof Theme.Type;

export const AccessRole = SettingsRole;

export type AccessRoleValue = typeof AccessRole.Type;

export const Model = Schema.Struct({
  access: AccessRole,
  bankLines: BankLinesScreen,
  categorize: CategorizeScreen,
  dashboard: Dashboard,
  investments: PortfolioSchema,
  route: AppRoute,
  search: SearchModel,
  settings: SettingsScreen,
  theme: Theme,
});

export type PecuniaModel = typeof Model.Type;

export const initialModel: PecuniaModel = {
  access: "owner",
  bankLines: initialBankLines,
  categorize: initialCategorize,
  dashboard: demoDashboard,
  investments: demoPortfolio,
  route: AppRoute.Dashboard(),
  search: initialSearch,
  settings: initialSettings,
  theme: "light",
};
