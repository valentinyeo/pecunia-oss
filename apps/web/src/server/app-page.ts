import { Router } from "@effect/ui";
import { HtmlServer } from "@effect/ui/html";
import { Effect, Layer, Option, Predicate } from "effect";
import { Rendered } from "foldkit/experimental/server";

import { PECUNIA_STATE_ID } from "../client/pecunia-ui/hydrate.js";
import { pecuniaDeferredPrerenderLayer } from "../client/pecunia-ui/queries.js";
import { PecuniaRoute, routeTitle } from "../client/pecunia-ui/route.js";
import { PecuniaApp } from "../features/pecunia-ui/app.js";
import { withCustomHead } from "./reader-document.js";

export const appPrerenderPaths = [
  "/app",
  "/app/categories",
  "/app/settings",
  "/app/subscriptions",
  "/app/transactions",
] as const;

const routeOf = (request: Request) => {
  const url = new URL(request.url);

  return Option.match(PecuniaRoute.resolve(`${url.pathname}${url.search}`), {
    onNone: () => PecuniaRoute.NotFound({ params: { "*": url.pathname } }),
    onSome: (resolved) => resolved.route,
  });
};

export const renderAppPage = (request: Request) =>
  Effect.gen(function* renderPecuniaApp() {
    const route = routeOf(request);
    const url = new URL(request.url);

    const rendered = yield* HtmlServer.renderToHtml(
      PecuniaApp,
      Router.props(PecuniaRoute),
      { budget: "10 millis", static: true }
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          Router.static({
            routes: PecuniaRoute,
            url: `${url.pathname}${url.search}`,
          }),
          pecuniaDeferredPrerenderLayer
        )
      )
    );

    const stateScript = `<script id="${PECUNIA_STATE_ID}" type="application/json">${HtmlServer.serializeState(rendered.state)}</script>`;

    return Rendered(
      withCustomHead(
        {
          html: `<div data-pecunia-ui-root>${rendered.html}</div>`,
          lang: "en",
          title: `${routeTitle(route)} · Pecunia`,
        },
        stateScript
      ),
      {
        status: Predicate.isTagged(route, "NotFound") ? 404 : 200,
      }
    );
  });
