import type { RoutingConfig } from "foldkit/runtime";

import { Message } from "./message.js";
import type { PecuniaMessage } from "./message.js";

export const routing: RoutingConfig<PecuniaMessage> = {
  onUrlChange: (url) => Message.ChangedUrl({ url }),
  onUrlRequest: (request) => Message.ClickedLink({ request }),
};
