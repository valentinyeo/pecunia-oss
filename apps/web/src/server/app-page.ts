import { Effect, Option, Predicate } from "effect";
import type { RenderedApplication } from "foldkit/experimental/server";
import { Rendered, renderToString } from "foldkit/experimental/server";
import { fromString } from "foldkit/url";

import { pecuniaProgram } from "../client/pecunia/program.js";
import { AppRoute, parseRoute } from "../client/pecunia/route.js";

export const appPrerenderPaths = [
  "/app",
  "/app/categories",
  "/app/transactions",
] as const;

const withAppHead = (application: RenderedApplication) => ({
  ...application,
  readerHead: "",
});

const routeOf = (request: Request) =>
  Option.match(fromString(request.url), {
    onNone: () => AppRoute.NotFound({ path: new URL(request.url).pathname }),
    onSome: parseRoute,
  });

export const renderAppPage = (request: Request) =>
  renderToString(pecuniaProgram, { url: request.url }).pipe(
    Effect.map((application) =>
      Rendered(withAppHead(application), {
        status: Predicate.isTagged(routeOf(request), "NotFound") ? 404 : 200,
      })
    )
  );
