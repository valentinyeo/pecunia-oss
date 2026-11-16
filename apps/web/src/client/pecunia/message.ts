import { defineMessageUnion } from "foldkit/message";
import { UrlRequest } from "foldkit/navigation";
import { Url } from "foldkit/url";

import { Theme } from "./model.js";

export const Message = defineMessageUnion({
  ChangedUrl: { url: Url },
  ClickedLink: { request: UrlRequest },
  ClickedTheme: { theme: Theme },
  CompletedLoadExternal: {},
  CompletedNavigate: {},
});

export type PecuniaMessage = typeof Message.Type;
