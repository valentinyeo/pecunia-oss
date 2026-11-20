import { Option } from "effect";
import { Update } from "foldkit";
import { UrlRequest } from "foldkit/navigation";
import { toString as urlToString } from "foldkit/url";
import type { Url } from "foldkit/url";

import type { BankLinesGateway } from "./bank-lines/gateway.js";
import type { BankLinesMessageValue } from "./bank-lines/message.js";
import { LineScope } from "./bank-lines/model.js";
import type { LineScopeValue } from "./bank-lines/model.js";
import {
  openBrowse,
  openReview,
  update as updateBankLines,
} from "./bank-lines/update.js";
import type { CategorizeGateway } from "./categorize/gateway.js";
import type { CategorizeMessageValue } from "./categorize/message.js";
import type { CategorizeScreenValue } from "./categorize/model.js";
import { update as updateCategorize } from "./categorize/update.js";
import { LoadExternal, Navigate, ReadLocation } from "./command.js";
import { Message } from "./message.js";
import type { PecuniaMessage } from "./message.js";
import { initialModel } from "./model.js";
import type { AccessRoleValue, PecuniaModel } from "./model.js";
import { AppRoute, parseRoute } from "./route.js";
import type { AppRouteValue } from "./route.js";
import type { SearchMessageValue } from "./search/message.js";
import { openSearch, update as updateSearch } from "./search/update.js";
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
import type { SubscriptionsGateway } from "./subscriptions/gateway.js";
import type { SubscriptionsMessageValue } from "./subscriptions/message.js";
import {
  open as openSubscriptions,
  update as updateSubscriptions,
} from "./subscriptions/update.js";

export type PecuniaReturn = Update.Return<
  PecuniaModel,
  PecuniaMessage,
  BankLinesGateway | CategorizeGateway | SettingsGateway | SubscriptionsGateway
>;

const gotSettingsMessage = (message: SettingsMessageValue): PecuniaMessage =>
  Message.GotSettingsMessage({ message });

const gotBankLinesMessage = (message: BankLinesMessageValue): PecuniaMessage =>
  Message.GotBankLinesMessage({ message });

const gotSearchMessage = (message: SearchMessageValue): PecuniaMessage =>
  Message.GotSearchMessage({ message });

const gotSubscriptionsMessage = (
  message: SubscriptionsMessageValue
): PecuniaMessage => Message.GotSubscriptionsMessage({ message });

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
      access: AccessRoleValue;
      message: SettingsMessageValue;
    }>
  ) => updateSettings(screen, input.access, input.message),
  write: (model, settings) => ({ ...model, settings }),
});

const foldBankLines = Update.foldChild({
  read: (model: PecuniaModel) => Option.some(model.bankLines),
  toParentMessage: gotBankLinesMessage,
  update: (
    screen: PecuniaModel["bankLines"],
    input: Readonly<{
      access: AccessRoleValue;
      message: BankLinesMessageValue;
    }>
  ) => updateBankLines(screen, input.access, input.message),
  write: (model, bankLines) => ({ ...model, bankLines }),
});

const foldSubscriptions = Update.foldChild({
  read: (model: PecuniaModel) => Option.some(model.subscriptions),
  toParentMessage: gotSubscriptionsMessage,
  update: (
    screen: PecuniaModel["subscriptions"],
    input: Readonly<{
      access: AccessRoleValue;
      message: SubscriptionsMessageValue;
    }>
  ) => updateSubscriptions(screen, input.access, input.message),
  write: (model, subscriptions) => ({ ...model, subscriptions }),
});

const foldSearch = Update.foldChild({
  read: (model: PecuniaModel) => Option.some(model.search),
  toParentMessage: gotSearchMessage,
  update: (screen: PecuniaModel["search"], message: SearchMessageValue) =>
    updateSearch(screen, message),
  write: (model, search) => ({ ...model, search }),
});

const openBankLines = (scope: LineScopeValue) =>
  Update.foldChildStep({
    read: (model: PecuniaModel) => Option.some(model.bankLines),
    toParentMessage: gotBankLinesMessage,
    update: (screen: PecuniaModel["bankLines"]) =>
      openBrowse(scope, "", screen),
    write: (model, bankLines) => ({ ...model, bankLines }),
  });

const openReviewScreen = Update.foldChildStep({
  read: (model: PecuniaModel) => Option.some(model.bankLines),
  toParentMessage: gotBankLinesMessage,
  update: openReview,
  write: (model, bankLines) => ({ ...model, bankLines }),
});

const openSubscriptionsScreen = Update.foldChildStep({
  read: (model: PecuniaModel) => Option.some(model.subscriptions),
  toParentMessage: gotSubscriptionsMessage,
  update: openSubscriptions,
  write: (model, subscriptions) => ({ ...model, subscriptions }),
});

const openSearchScreen = (query: string) =>
  Update.foldChildStep({
    read: (model: PecuniaModel) => Option.some(model.search),
    toParentMessage: gotSearchMessage,
    update: (screen: PecuniaModel["search"]) => openSearch(query, screen),
    write: (model, search) => ({ ...model, search }),
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
    Review: () => openReviewScreen(next),
    Rules: () => ({ model: next }),
    Search: ({ q }) => openSearchScreen(Option.getOrElse(q, () => ""))(next),
    Settings: () => openSettingsScreen(next),
    Spending: ({ categoryId }) =>
      openBankLines(LineScope.Category({ categoryId }))(next),
    Subscriptions: () => openSubscriptionsScreen(next),
    Transactions: () => openBankLines(LineScope.All())(next),
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
    GotBankLinesMessage: ({ message: bankLinesMessage }) =>
      foldBankLines(model, { access: model.access, message: bankLinesMessage }),
    GotCategorizeMessage: ({ message: categorizeMessage }) =>
      foldCategorize(model, {
        access: model.access,
        message: categorizeMessage,
      }),
    GotSearchMessage: ({ message: searchMessage }) =>
      foldSearch(model, searchMessage),
    GotSettingsMessage: ({ message: settingsMessage }) =>
      foldSettings(model, { access: model.access, message: settingsMessage }),
    GotSubscriptionsMessage: ({ message: subscriptionsMessage }) =>
      foldSubscriptions(model, {
        access: model.access,
        message: subscriptionsMessage,
      }),
  });
