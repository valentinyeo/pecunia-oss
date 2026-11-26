// @effect-diagnostics anyUnknownInErrorContext:off unsafeEffectTypeAssertion:off -- The MCP proxy forwards heterogeneous contracts over RpcClient without duplicating per-tool wrappers.
import type { AnyCapability } from "@pecunia/capability";
import { toToolkit } from "@pecunia/capability/toolkit";
import { Data, Effect, Layer, Option } from "effect";
import { McpProtocol, McpServer } from "effect/ai";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { pecuniaContracts, pecuniaRpcGroup } from "./contracts.js";

export type BackendFetch = (request: Request) => Promise<Response>;

export const MCP_PRINCIPAL_HEADER = "x-pecunia-mcp-principal";

const sha256Bytes = (value: string) =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  ).pipe(Effect.map((buffer) => new Uint8Array(buffer)));

export const constantTimeEqual = (
  left: string,
  right: string
): Effect.Effect<boolean> =>
  Effect.gen(function* compareDigests() {
    const leftHash = yield* sha256Bytes(left);
    const rightHash = yield* sha256Bytes(right);
    let mismatches = 0;

    for (const [index, byte] of leftHash.entries()) {
      mismatches += byte === rightHash[index] ? 0 : 1;
    }

    return mismatches === 0;
  });

const extractBearerToken = (header: string | null): Option.Option<string> => {
  if (header === null) {
    return Option.none();
  }

  const match = /^Bearer\s+(?<token>\S+)$/iu.exec(header.trim());
  const token = match?.groups?.token;

  return token === undefined || token.length === 0
    ? Option.none()
    : Option.some(token);
};

export type BearerAuthVerdict = "authorized" | "unauthorized" | "unconfigured";

export const verifyBearerRequest = (
  request: Request,
  configuredToken: Option.Option<string>
): Effect.Effect<BearerAuthVerdict> =>
  Effect.gen(function* checkBearer() {
    if (
      Option.isNone(configuredToken) ||
      configuredToken.value.trim().length === 0
    ) {
      return "unconfigured" as const;
    }

    const provided = extractBearerToken(request.headers.get("authorization"));

    if (Option.isNone(provided)) {
      return "unauthorized" as const;
    }

    const valid = yield* constantTimeEqual(
      provided.value,
      configuredToken.value
    );

    return valid ? ("authorized" as const) : ("unauthorized" as const);
  });

const normalizeMcpRequest = (request: Request): Request => {
  const url = new URL(request.url);

  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/mcp";

    return new Request(url, request);
  }

  return request;
};

class ProxyCapability extends Data.TaggedClass("Capability")<
  Omit<AnyCapability, "_tag">
> {}

type DynamicRpcInvoker = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Heterogeneous RPC dispatch forwards decoded tool arguments by contract name.
  input: unknown
) => Effect.Effect<unknown, unknown>;

const proxyCapabilitiesFor = (
  client: ReadonlyMap<string, DynamicRpcInvoker>
): readonly AnyCapability[] =>
  pecuniaContracts.map((contract) => {
    const call = client.get(contract.name);

    return new ProxyCapability({
      contract,
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Toolkit decodes each tool input schema before invoking the proxy handler.
      handler: (input: unknown) =>
        call === undefined
          ? Effect.die(`Unknown Pecunia RPC contract: ${contract.name}`)
          : call(input),
    });
  });

export const mcpWebHandler = (
  backendFetch: BackendFetch,
  configuredToken: Option.Option<string>
) => {
  const backendFetchLayer = Layer.succeed(
    FetchHttpClient.Fetch,
    (input, init) => {
      const request = new Request(input, init);
      const headers = new Headers(request.headers);

      headers.set(MCP_PRINCIPAL_HEADER, "owner");

      return backendFetch(new Request(request, { headers }));
    }
  );

  const protocolLayer = RpcClient.layerProtocolHttp({
    url: "http://pecunia-rpc.internal/rpc",
  }).pipe(
    Layer.provide([
      FetchHttpClient.layer.pipe(Layer.provide(backendFetchLayer)),
      RpcSerialization.layerJson,
    ])
  );

  const mcpLayer = Layer.unwrap(
    Effect.gen(function* buildMcpRoutes() {
      const client = yield* RpcClient.make(pecuniaRpcGroup.group).pipe(
        Effect.provide(protocolLayer)
      );

      // SAFETY: Object.entries over RpcClient.make yields one callable method per contract name in pecuniaContracts.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Heterogeneous lookup map over the typed RpcClient methods.
      const entries = Object.entries(client) as [string, DynamicRpcInvoker][];
      const invokers = new Map<string, DynamicRpcInvoker>(entries);

      const tools = toToolkit(proxyCapabilitiesFor(invokers));

      return McpServer.toolkit(tools.toolkit).pipe(
        Layer.provideMerge(tools.layer),
        Layer.provide(
          McpServer.layerHttp({
            name: "pecunia-mcp",
            path: "/mcp",
            protocols: [McpProtocol.v2025_06_18, McpProtocol.v2025_03_26],
            version: "0.1.0",
          })
        )
      );
    })
  );

  const { dispose, handler: mcpHandler } = HttpRouter.toWebHandler(mcpLayer, {
    disableLogger: true,
  });

  const handle = (request: Request): Effect.Effect<Response> =>
    Effect.gen(function* handleMcpRequest() {
      const verdict = yield* verifyBearerRequest(request, configuredToken);

      if (verdict === "unconfigured") {
        return new Response(
          "MCP_BEARER_TOKEN is not configured on this deployment.",
          { status: 503 }
        );
      }

      if (verdict === "unauthorized") {
        return new Response("Unauthorized", {
          headers: { "WWW-Authenticate": "Bearer" },
          status: 401,
        });
      }

      return yield* Effect.promise(() =>
        mcpHandler(normalizeMcpRequest(request))
      );
    });

  return { dispose, handle };
};
