import { Effect, Layer, Option, Schema } from "effect";
import {
  Rendered,
  Responded,
  renderToString,
} from "foldkit/experimental/server";
import { readerErrorTemplate } from "virtual:reader-error";

import {
  ReaderErrorPage,
  readerErrorPath,
} from "../../site/src/reader-error-page.js";
import { isAppPath } from "./client/mount.js";
import { findPage, pagePaths } from "./client/reader-pages.js";
import { init } from "./client/reader/init.js";
import { ReaderFlags } from "./client/reader/model.js";
import { view } from "./features/reader.js";
import { isWorkerFirstReaderRoute } from "./reader-routes.js";
import { appPrerenderPaths, renderAppPage } from "./server/app-page.js";
import { readerPrerenderOrigin } from "./server/prerender-origin.js";
import { withReaderHead } from "./server/reader-document.js";
import { ReaderErrorTemplate } from "./server/reader-error-template.js";
import { readerErrorFlags } from "./server/reader-error.js";
import { WebsiteBindingError } from "./server/website-binding-error.js";
import {
  WebsiteBindings,
  websiteTelemetry,
} from "./server/website-bindings.js";

export const prerenderPaths = [...appPrerenderPaths, ...pagePaths];

export { renderDocument } from "./server/reader-document.js";

const errorTemplate =
  Schema.decodeUnknownSync(ReaderErrorTemplate)(readerErrorTemplate);

const decodeErrorPage = Schema.decodeUnknownEffect(
  Schema.fromJsonString(ReaderErrorPage)
);

const previewHeaders = Effect.fn("reader.previewHeaders")(
  function* previewHeaders(request: Request) {
    const headers = new Headers();

    if (/^pr-[1-9][0-9]*\.ratstack\.sh$/u.test(new URL(request.url).hostname)) {
      const bindings = yield* WebsiteBindings;
      const commit = yield* bindings.previewCommit;

      if (commit === undefined) {
        return yield* new WebsiteBindingError({
          cause: "Missing PREVIEW_COMMIT",
          message: "Preview responses require the full deployed commit binding",
        });
      }

      headers.set("X-Robots-Tag", "noindex");
      headers.set("X-Preview-Commit", commit);
    }

    return headers;
  }
);

const responded = Effect.fn("reader.responded")(function* responded(
  request: Request,
  response: Response
) {
  const headers = new Headers(response.headers);
  const preview = yield* previewHeaders(request);

  for (const [name, value] of preview) {
    headers.set(name, value);
  }

  return Responded(
    new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    })
  );
});

const renderErrorRoute = Effect.fn("reader.renderErrorRoute")(
  function* renderErrorRoute(request: Request) {
    if (request.method !== "POST") {
      return yield* responded(
        request,
        new Response("Error pages accept POST", {
          headers: { Allow: "POST" },
          status: 405,
        })
      );
    }

    const errorPage = yield* Effect.tryPromise(request.text.bind(request)).pipe(
      Effect.flatMap(decodeErrorPage),
      Effect.option
    );

    if (Option.isNone(errorPage)) {
      return yield* responded(
        request,
        new Response("Error pages need a ReaderErrorPage JSON body", {
          status: 400,
        })
      );
    }

    const flags = readerErrorFlags(errorTemplate, errorPage.value);

    const application = yield* renderToString(
      { Flags: ReaderFlags, init, view },
      { flags }
    );

    const headers = yield* previewHeaders(request);

    return Rendered(withReaderHead(application, flags), {
      headers,
      status: errorPage.value.code,
    });
  }
);

const matchesPrefix = (pathname: string, prefix: string): boolean =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

const forwardRpc = Effect.fn("reader.forwardRpc")(function* forwardRpc(
  request: Request,
  pathname: string
) {
  const bindings = yield* WebsiteBindings;

  const response = matchesPrefix(pathname, "/app/rpc")
    ? yield* bindings.forwardPecunia(request)
    : yield* bindings.forward(request);

  return yield* responded(request, response);
});

export const renderReaderPage = Effect.fn("reader.renderPage")(
  function* renderReaderPage(request: Request) {
    const { pathname } = new URL(request.url);

    if (matchesPrefix(pathname, "/__rat")) {
      return yield* responded(
        request,
        new Response("Not found", { status: 404 })
      );
    }

    if (
      matchesPrefix(pathname, "/rpc") ||
      matchesPrefix(pathname, "/app/rpc")
    ) {
      return yield* forwardRpc(request, pathname);
    }

    if (pathname === readerErrorPath) {
      return yield* renderErrorRoute(request);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return yield* responded(
        request,
        new Response("Reader pages accept GET or HEAD", {
          headers: { Allow: "GET, HEAD" },
          status: 405,
        })
      );
    }

    if (isAppPath(pathname)) {
      return yield* renderAppPage(request);
    }

    const route = pathname === "/" ? pathname : pathname.replace(/\/$/u, "");
    const found = yield* findPage(route);

    if (Option.isNone(found)) {
      return yield* responded(
        request,
        new Response("This route is outside the reader preview slice", {
          status: 404,
        })
      );
    }

    const page = found.value;
    const promptRoute = isWorkerFirstReaderRoute(route);
    const prerender = new URL(request.url).origin === readerPrerenderOrigin;

    if (
      promptRoute &&
      !prerender &&
      !(request.headers.get("Accept") ?? "").includes("text/html")
    ) {
      return yield* responded(
        request,
        new Response(
          request.method === "HEAD"
            ? null
            : Option.getOrNull(page.agentMarkdown),
          {
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              Vary: "Accept",
            },
            status: page.page.status,
          }
        )
      );
    }

    const application = yield* renderToString(
      { Flags: ReaderFlags, init, view },
      { flags: page }
    );

    const headers = yield* previewHeaders(request);

    if (promptRoute && !prerender) {
      headers.set("Vary", "Accept");
    }

    return Rendered(
      withReaderHead(application, page),
      prerender
        ? { status: page.page.status }
        : { headers, status: page.page.status }
    );
  }
);

export const renderPage = (request: Request) =>
  Effect.runPromise(
    renderReaderPage(request).pipe(
      Effect.provide(
        Layer.mergeAll(
          WebsiteBindings.layer,
          new URL(request.url).origin === readerPrerenderOrigin
            ? Layer.empty
            : websiteTelemetry
        )
      )
    )
  );
