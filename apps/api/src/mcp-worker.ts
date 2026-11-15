import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect } from "effect";
import { HttpServerResponse } from "effect/http";

import PecuniaRpcBackend from "./rpc-worker.js";

const notYetProjected =
  "The MCP toolkit endpoint ships with the Pecunia MCP surface. Pecunia's capabilities answer over RPC today.";

export default class McpEndpoint extends Cloudflare.Worker<McpEndpoint>()(
  "McpEndpoint",
  {
    env: {
      BACKEND: PecuniaRpcBackend,
      MCP_BEARER_TOKEN: Config.Redacted("MCP_BEARER_TOKEN"),
    },
    main: import.meta.url,
    workersDev: false,
  },
  Effect.succeed({
    fetch: Effect.succeed(
      HttpServerResponse.text(notYetProjected, { status: 501 })
    ),
  })
) {}
