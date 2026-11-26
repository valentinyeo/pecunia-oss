import * as Cloudflare from "@alchemy.run/cloudflare";
import { Config, Effect, Option, Predicate, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/http";

import { privateObservability } from "../../site/src/observability.js";
import { mcpWebHandler } from "./mcp-handler.js";
import type { BackendFetch } from "./mcp-handler.js";
import PecuniaRpcBackend from "./rpc-worker.js";
import { bindSecretSetting } from "./settings-binding.js";
import { WorkerRuntimeUnavailable } from "./worker-runtime-error.js";

const isBackendService = (
  input: unknown
): input is { readonly fetch: BackendFetch } =>
  Predicate.isObject(input) &&
  Predicate.hasProperty(input, "fetch") &&
  Predicate.isFunction(input.fetch);

const McpRuntimeModule = Schema.Struct({
  env: Schema.Struct({
    BACKEND: Schema.declare<{ readonly fetch: BackendFetch }>(isBackendService),
    MCP_BEARER_TOKEN: Schema.optionalKey(Schema.String),
  }),
});

const missingRuntimeBackend: BackendFetch = () =>
  Promise.resolve(
    new Response("BACKEND binding is unavailable outside the Worker runtime.", {
      status: 503,
    })
  );

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

    const configuredToken = yield* Config.option(
      Config.String("MCP_BEARER_TOKEN")
    );

    yield* bindSecretSetting(host, "MCP_BEARER_TOKEN", configuredToken);

    const runtimeEnv =
      globalThis.__ALCHEMY_RUNTIME__ === true
        ? yield* Effect.tryPromise({
            catch: (cause) => new WorkerRuntimeUnavailable({ cause }),
            try: () => import("cloudflare:workers"),
          }).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(McpRuntimeModule)),
            Effect.map(({ env }) => env),
            Effect.option
          )
        : Option.none();

    const backendFetch: BackendFetch = Option.match(runtimeEnv, {
      onNone: () => missingRuntimeBackend,
      onSome:
        ({ BACKEND }) =>
        (request) =>
          BACKEND.fetch(request),
    });

    const token = Option.match(runtimeEnv, {
      onNone: () => configuredToken,
      onSome: ({ MCP_BEARER_TOKEN }) => Option.fromNullishOr(MCP_BEARER_TOKEN),
    });

    const mcp = mcpWebHandler(backendFetch, token);

    return {
      fetch: Effect.gen(function* handleMcpFetch() {
        const request = yield* HttpServerRequest.HttpServerRequest;

        const webRequest = yield* HttpServerRequest.toWeb(request).pipe(
          Effect.orDie
        );

        const response = yield* mcp.handle(webRequest);

        return HttpServerResponse.raw(response);
      }),
    };
  })
) {}
