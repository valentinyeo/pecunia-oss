import { Context, Effect, Layer, Option, Predicate, Schema } from "effect";

import { privateNativeTracerLayer } from "../../../site/src/observability.js";
import type { BackendFetch } from "./rpc.js";
import { WebsiteBindingError } from "./website-binding-error.js";

const WebsiteEnvironment = Schema.Struct({
  BACKEND: Schema.declare<{ readonly fetch: BackendFetch }>(
    (input): input is { readonly fetch: BackendFetch } =>
      Predicate.isObject(input) &&
      Predicate.hasProperty(input, "fetch") &&
      Predicate.isFunction(input.fetch)
  ),
  PECUNIA_BACKEND: Schema.optionalKey(
    Schema.declare<{ readonly fetch: BackendFetch }>(
      (input): input is { readonly fetch: BackendFetch } =>
        Predicate.isObject(input) &&
        Predicate.hasProperty(input, "fetch") &&
        Predicate.isFunction(input.fetch)
    )
  ),
  PREVIEW_COMMIT: Schema.optionalKey(
    Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/u))
  ),
  TRACES_ENABLED: Schema.optionalKey(Schema.Literals(["true", "false"])),
});

const importRuntime = Effect.tryPromise({
  catch: (cause) =>
    new WebsiteBindingError({
      cause,
      message: "Website bindings require the Cloudflare Worker runtime",
    }),
  try: () => import("cloudflare:workers"),
});

const runtimeEnvironment = importRuntime.pipe(
  Effect.flatMap(({ env }) => Schema.decodeEffect(WebsiteEnvironment)(env)),
  Effect.mapError(
    (cause) =>
      new WebsiteBindingError({
        cause,
        message:
          "Website requires BACKEND and a valid optional PREVIEW_COMMIT binding",
      })
  )
);

const WebsiteTraceEnvironment = Schema.Struct({
  TRACES_ENABLED: WebsiteEnvironment.fields.TRACES_ENABLED,
});

export const websiteTelemetryFor = (
  environment: typeof WebsiteTraceEnvironment.Type
) =>
  environment.TRACES_ENABLED === "true"
    ? privateNativeTracerLayer
    : Layer.empty;

export const websiteTelemetry = Layer.unwrap(
  importRuntime.pipe(
    Effect.option,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(Layer.empty),
        onSome: ({ env }) =>
          Schema.decodeUnknownEffect(WebsiteTraceEnvironment)(env).pipe(
            Effect.orDie,
            Effect.map(websiteTelemetryFor)
          ),
      })
    )
  )
);

const rewritePecuniaRpc = (request: Request): Request => {
  const url = new URL(request.url);

  url.pathname = url.pathname.replace(/^\/app\/rpc(?=\/|$)/u, "/rpc");

  return new Request(url, request);
};

export class WebsiteBindings extends Context.Service<
  WebsiteBindings,
  {
    readonly forward: (
      request: Request
    ) => Effect.Effect<Response, WebsiteBindingError>;
    readonly forwardPecunia: (
      request: Request
    ) => Effect.Effect<Response, WebsiteBindingError>;
    readonly previewCommit: Effect.Effect<
      string | undefined,
      WebsiteBindingError
    >;
  }
>()("@pecunia/web/WebsiteBindings", {
  make: Effect.succeed({
    forward: Effect.fn("WebsiteBindings.forward")(function* forward(
      request: Request
    ) {
      const bindings = yield* runtimeEnvironment;

      return yield* Effect.tryPromise({
        catch: (cause) =>
          new WebsiteBindingError({
            cause,
            message:
              "RpcBackend forwarding failed; inspect the private service binding",
          }),
        try: () => bindings.BACKEND.fetch(request),
      });
    }),
    forwardPecunia: Effect.fn("WebsiteBindings.forwardPecunia")(
      function* forwardPecunia(request: Request) {
        const bindings = yield* runtimeEnvironment;
        const target = bindings.PECUNIA_BACKEND;

        if (target === undefined) {
          return new Response(
            "PecuniaRpcBackend is not bound on this deployment.",
            { status: 503 }
          );
        }

        return yield* Effect.tryPromise({
          catch: (cause) =>
            new WebsiteBindingError({
              cause,
              message:
                "PecuniaRpcBackend forwarding failed; inspect the private service binding",
            }),
          try: () => target.fetch(rewritePecuniaRpc(request)),
        });
      }
    ),
    previewCommit: runtimeEnvironment.pipe(
      Effect.map((bindings) => bindings.PREVIEW_COMMIT)
    ),
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly testLayer = (service: WebsiteBindings["Service"]) =>
    Layer.succeed(this, service);
}
