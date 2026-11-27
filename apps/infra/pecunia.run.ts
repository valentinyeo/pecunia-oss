import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Drizzle from "@alchemy.run/drizzle/Providers";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import McpEndpoint from "../api/src/mcp-worker.js";
import SyncWorker from "../sync/src/sync-worker.js";
import { Website } from "../web/src/website.js";
import { pecuniaState } from "./src/state-store.js";

export default Alchemy.Stack(
  "Pecunia",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: pecuniaState(),
  },
  Effect.gen(function* pecuniaStack() {
    const website = yield* Website;

    const sync = yield* SyncWorker;

    const mcp = yield* McpEndpoint;

    return {
      mcpUrl: mcp.url,
      syncWorkerName: sync.workerName,
      websiteUrl: website.url,
    };
  })
);
