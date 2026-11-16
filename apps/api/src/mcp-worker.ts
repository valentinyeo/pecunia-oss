import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect } from "effect";
import { HttpServerResponse } from "effect/http";

import { privateObservability } from "../../site/src/observability.js";
import PecuniaRpcBackend from "./rpc-worker.js";
import { bindSecretSetting } from "./settings-binding.js";

const notYetProjected =
  "The MCP toolkit endpoint ships with the Pecunia MCP surface. Pecunia's capabilities answer over RPC today.";

export default class McpEndpoint extends Cloudflare.Worker<McpEndpoint>()(
  "McpEndpoint",
  {
    compatibility: { date: "2026-05-28" },
    env: { BACKEND: PecuniaRpcBackend },
    main: import.meta.url,
    observability: privateObservability,
    workersDev: false,
  },
  Effect.gen(function* mcpEndpointRuntime() {
    const host = yield* Cloudflare.Worker;

    yield* bindSecretSetting(
      host,
      "MCP_BEARER_TOKEN",
      yield* Config.option(Config.String("MCP_BEARER_TOKEN"))
    );

    return {
      fetch: Effect.succeed(
        HttpServerResponse.text(notYetProjected, { status: 501 })
      ),
    };
  })
) {}
