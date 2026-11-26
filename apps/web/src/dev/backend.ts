import { pecuniaRpcWebHandler } from "@pecunia/api/rpc-handler";
import { eventFlags, Flags } from "@pecunia/core/flags";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { contentCapabilities } from "@pecunia/site/capabilities";
import { nodeContentLayer } from "@pecunia/site/node-content";
import { Layer } from "effect";
import { HttpRouter } from "effect/http";

import type { BackendFetch } from "../server/rpc.js";
import { devtoolsRoutes } from "./devtools/routes.js";

const { handler: contentHandler } = HttpRouter.toWebHandler(
  devtoolsRoutes(contentCapabilities).pipe(Layer.provide(nodeContentLayer)),
  {
    disableLogger: true,
  }
);

const { handler: pecuniaHandler } = pecuniaRpcWebHandler(
  openDemoSqliteLayer(),
  Flags.defaults(eventFlags)
);

const rewriteAppRpc = (request: Request): Request => {
  const url = new URL(request.url);

  url.pathname = url.pathname.replace(/^\/app\/rpc(?=\/|$)/u, "/rpc");

  return new Request(url, request);
};

export const backend: BackendFetch = (request) => {
  const { pathname } = new URL(request.url);

  return pathname === "/app/rpc" || pathname.startsWith("/app/rpc/")
    ? pecuniaHandler(rewriteAppRpc(request))
    : contentHandler(request);
};
