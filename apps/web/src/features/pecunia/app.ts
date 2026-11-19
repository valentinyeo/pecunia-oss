import * as stylex from "@stylexjs/stylex";
import type { Update } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { UrlRequest } from "foldkit/navigation";
import { toString as urlToString } from "foldkit/url";
import type { Url } from "foldkit/url";

import {
  LoadExternal,
  Navigate,
  ReadLocation,
} from "../../client/pecunia/command.js";
import { Message } from "../../client/pecunia/message.js";
import type { PecuniaMessage } from "../../client/pecunia/message.js";
import { initialModel } from "../../client/pecunia/model.js";
import type { PecuniaModel } from "../../client/pecunia/model.js";
import {
  AppRoute,
  dashboardRouter,
  parseRoute,
} from "../../client/pecunia/route.js";
import { dashboardScreen } from "./dashboard.js";
import { frame } from "./frame.js";
import { investmentsScreen } from "./investments.js";
import { routeTitle } from "./navigation.js";
import { styles } from "./pecunia.stylex.js";

export type PecuniaReturn = Update.Return<PecuniaModel, PecuniaMessage>;

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

export const init = (url: Url): PecuniaReturn => ({
  model: { ...initialModel, route: parseRoute(url) },
});

export const boot: PecuniaReturn = {
  commands: [ReadLocation()],
  model: initialModel,
};

export const update = (
  model: PecuniaModel,
  message: PecuniaMessage
): PecuniaReturn =>
  Message.match<PecuniaReturn>(message, {
    ChangedUrl: ({ url }) => ({ model: { ...model, route: parseRoute(url) } }),
    ClickedLink: ({ request }) =>
      UrlRequest.match<PecuniaReturn>(request, {
        External: ({ href }) => ({ commands: [LoadExternal({ href })], model }),
        Internal: ({ url }) => ({
          commands: [Navigate({ url: urlToString(url) })],
          model,
        }),
      }),
    ClickedTheme: ({ theme }) => ({ model: { ...model, theme } }),
    CompletedLoadExternal: () => ({ model }),
    CompletedNavigate: () => ({ model }),
  });

const screen = (model: PecuniaModel, h: HtmlBuilder<PecuniaMessage>): Html =>
  AppRoute.match<Html>(model.route, {
    Budgets: () => laterScreen(model, h),
    Dashboard: () => dashboardScreen(model.dashboard, h),
    Investments: () => investmentsScreen(model.investments, h),
    NotFound: () => notFound(h),
    Settings: () => laterScreen(model, h),
    Subscriptions: () => laterScreen(model, h),
    Transactions: () => laterScreen(model, h),
  });

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
        ["This screen lands in a later slice. The dashboard is the first."]
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

export const view = (
  model: PecuniaModel,
  h: HtmlBuilder<PecuniaMessage>
): Html => frame(model, screen(model, h), h);
