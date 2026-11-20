import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";

import { Message as BankLinesMessage } from "./bank-lines/message.js";
import { Message as CategorizeMessage } from "./categorize/message.js";
import { Theme } from "./model.js";
import { Message as SearchMessage } from "./search/message.js";
import { Message as SettingsMessage } from "./settings/message.js";
import { Message as SubscriptionsMessage } from "./subscriptions/message.js";

export const Message = defineMessageUnion({
  ChangedUrl: { url: Url },
  ClickedLink: { request: UrlRequest },
  ClickedTheme: { theme: Theme },
  CompletedLoadExternal: {},
  CompletedNavigate: {},
  GotBankLinesMessage: { message: BankLinesMessage },
  GotCategorizeMessage: { message: CategorizeMessage },
  GotSearchMessage: { message: SearchMessage },
  GotSettingsMessage: { message: SettingsMessage },
  GotSubscriptionsMessage: { message: SubscriptionsMessage },
});

export type PecuniaMessage = typeof Message.Type;
