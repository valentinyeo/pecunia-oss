import { Option } from "effect";
import { Update } from "foldkit";
import { UrlRequest } from "foldkit/navigation";
import { toString as urlToString } from "foldkit/url";
import type { Url } from "foldkit/url";

import type { CategorizeGateway } from "./categorize/gateway.js";
import type { CategorizeMessageValue } from "./categorize/message.js";
import type { CategorizeScreenValue } from "./categorize/model.js";
import { update as updateCategorize } from "./categorize/update.js";
import { LoadExternal, Navigate, ReadLocation } from "./command.js";
import { Message } from "./message.js";
import type { PecuniaMessage } from "./message.js";
import { initialModel } from "./model.js";
import type { PecuniaModel } from "./model.js";
import { AppRoute, parseRoute } from "./route.js";
import type { AppRouteValue } from "./route.js";
import type { SettingsGateway } from "./settings/gateway.js";
import type { SettingsMessageValue } from "./settings/message.js";
import type {
  SettingsRoleValue,
  SettingsScreenValue,
} from "./settings/model.js";
import {
  open as openSettings,
  update as updateSettings,
} from "./settings/update.js";

export type PecuniaReturn = Update.Return<
  PecuniaModel,
  PecuniaMessage,
  CategorizeGateway | SettingsGateway
>;

const gotSettingsMessage = (message: SettingsMessageValue): PecuniaMessage =>
  Message.GotSettingsMessage({ message });

const openSettingsScreen = Update.foldChildStep({
  read: (model: PecuniaModel) => Option.some(model.settings),
  toParentMessage: gotSettingsMessage,
  update: openSettings,
  write: (model, settings) => ({ ...model, settings }),
});

const gotCategorizeMessage = (
  message: CategorizeMessageValue
): PecuniaMessage => Message.GotCategorizeMessage({ message });

const foldCategorize = Update.foldChild({
  read: (model: PecuniaModel) => Option.some(model.categorize),
  toParentMessage: gotCategorizeMessage,
  update: (
    categorize: CategorizeScreenValue,
    input: Readonly<{
      access: SettingsRoleValue;
      message: CategorizeMessageValue;
    }>
  ) => updateCategorize(categorize, input.access, input.message),
  write: (model, categorize) => ({ ...model, categorize }),
});

const foldSettings = Update.foldChild({
  read: (model: PecuniaModel) => Option.some(model.settings),
  toParentMessage: gotSettingsMessage,
  update: (
    screen: SettingsScreenValue,
    input: Readonly<{
      access: SettingsRoleValue;
      message: SettingsMessageValue;
    }>
  ) => updateSettings(screen, input.access, input.message),
  write: (model, settings) => ({ ...model, settings }),
});

const enterRoute = (
  model: PecuniaModel,
  route: AppRouteValue
): PecuniaReturn => {
  const next = { ...model, route };

  return AppRoute.match<PecuniaReturn>(route, {
    Aliases: () => ({ model: next }),
    Budgets: () => ({ model: next }),
    Categories: () => ({ model: next }),
    Dashboard: () => ({ model: next }),
    Investments: () => ({ model: next }),
    MerchantDetail: () => ({ model: next }),
    Merchants: () => ({ model: next }),
    NotFound: () => ({ model: next }),
    Rules: () => ({ model: next }),
    Settings: () => openSettingsScreen(next),
    Subscriptions: () => ({ model: next }),
    Transactions: () => ({ model: next }),
  });
};

export const init = (url: Url): PecuniaReturn =>
  enterRoute(initialModel, parseRoute(url));

export const boot: PecuniaReturn = {
  commands: [ReadLocation()],
  model: initialModel,
};

export const update = (
  model: PecuniaModel,
  message: PecuniaMessage
): PecuniaReturn =>
  Message.match<PecuniaReturn>(message, {
    ChangedUrl: ({ url }) => enterRoute(model, parseRoute(url)),
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
    GotCategorizeMessage: ({ message: categorizeMessage }) =>
      foldCategorize(model, {
        access: model.access,
        message: categorizeMessage,
      }),
    GotSettingsMessage: ({ message: settingsMessage }) =>
      foldSettings(model, { access: model.access, message: settingsMessage }),
  });
