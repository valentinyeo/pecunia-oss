import * as stylex from "@stylexjs/stylex";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/pecunia/message.js";
import type { PecuniaMessage } from "../../client/pecunia/message.js";
import type { PecuniaModel } from "../../client/pecunia/model.js";
import { AppRoute, dashboardRouter } from "../../client/pecunia/route.js";
import { view as bankLinesView } from "./bank-lines.js";
import { dashboardScreen } from "./dashboard.js";
import { frame } from "./frame.js";
import { routeTitle } from "./navigation.js";
import { styles } from "./pecunia.stylex.js";
import { view as searchView } from "./search.js";
import { view as settingsView } from "./settings.js";

export { boot, init, update } from "../../client/pecunia/update.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

const laterScreen = (
  model: PecuniaModel,
  h: HtmlBuilder<PecuniaMessage>
): Html =>
  h.section(
    [h.AriaLabel(routeTitle(model.route)), h.Class(className(styles.section))],
    [
      h.h1([h.Class(className(styles.pageTitle))], [routeTitle(model.route)]),
      h.p(
        [h.Class(className(styles.placeholder)), h.Role("note")],
        [
          "This screen lands in a later slice. The demo book has no data for it yet.",
        ]
      ),
    ]
  );

const notFound = (h: HtmlBuilder<PecuniaMessage>): Html =>
  h.section(
    [h.AriaLabel("Page not found"), h.Class(className(styles.section))],
    [
      h.h1([h.Class(className(styles.pageTitle))], ["Page not found"]),
      h.p(
        [h.Class(className(styles.placeholder))],
        [
          "Nothing lives at this address. ",
          h.a([h.Href(dashboardRouter())], ["Back to the dashboard"]),
        ]
      ),
    ]
  );

const bankLines = (model: PecuniaModel, h: HtmlBuilder<PecuniaMessage>): Html =>
  h.submodel({
    model: model.bankLines,
    slotId: "bank-lines",
    toParentMessage: (message) => Message.GotBankLinesMessage({ message }),
    view: bankLinesView,
    viewInputs: { canWrite: model.access === "owner" },
  });

const search = (model: PecuniaModel, h: HtmlBuilder<PecuniaMessage>): Html =>
  h.submodel({
    model: model.search,
    slotId: "search",
    toParentMessage: (message) => Message.GotSearchMessage({ message }),
    view: searchView,
  });

const screen = (model: PecuniaModel, h: HtmlBuilder<PecuniaMessage>): Html =>
  AppRoute.match<Html>(model.route, {
    Budgets: () => laterScreen(model, h),
    Dashboard: () => dashboardScreen(model.dashboard, h),
    Investments: () => laterScreen(model, h),
    NotFound: () => notFound(h),
    Review: () => bankLines(model, h),
    Search: () => search(model, h),
    Settings: () =>
      h.submodel({
        model: model.settings,
        slotId: "settings",
        toParentMessage: (message) => Message.GotSettingsMessage({ message }),
        view: settingsView,
      }),
    Spending: () => bankLines(model, h),
    Subscriptions: () => laterScreen(model, h),
    Transactions: () => bankLines(model, h),
  });

export const view = (
  model: PecuniaModel,
  h: HtmlBuilder<PecuniaMessage>
): Html => frame(model, screen(model, h), h);
