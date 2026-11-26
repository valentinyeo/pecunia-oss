import { Router } from "@effect/ui";
import type { Renderer } from "@effect/ui";
import { BrowserHost, BrowserRouter, HtmlHydrate } from "@effect/ui/html";
import { Effect, Layer, Option, Schema } from "effect";

import { PecuniaApp } from "../../features/pecunia-ui/app.js";
import { PecuniaApi } from "./api.js";
import { pecuniaQueryLayer } from "./queries.js";
import { PecuniaRoute } from "./route.js";

export const PECUNIA_STATE_ID = "pecunia-ui-state";

const readHydrationState = (): Option.Option<Renderer.State> => {
  const node = document.querySelector(`#${PECUNIA_STATE_ID}`);

  if (node?.textContent === null || node?.textContent === undefined) {
    return Option.none();
  }

  return Schema.decodeOption(Schema.fromJsonString(Schema.Unknown))(
    node.textContent
  ).pipe(
    Option.map(
      // SAFETY: the server embeds HtmlServer.serializeState(rendered.state) inside #pecunia-ui-state.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Hydrated state JSON produced by HtmlServer.serializeState.
      (parsed) => parsed as Renderer.State
    )
  );
};

export const mountPecuniaUi = (container: Element) => {
  const target = container.querySelector("[data-pecunia-ui-root]") ?? container;
  const state = readHydrationState();

  const runtimeLayer = Layer.mergeAll(
    BrowserRouter.layer({ routes: PecuniaRoute }),
    pecuniaQueryLayer.pipe(Layer.provide(PecuniaApi.layer))
  );

  const program = Option.match(state, {
    onNone: () =>
      BrowserHost.mountEffect(
        PecuniaApp,
        Router.props(PecuniaRoute),
        target
      ).pipe(Effect.andThen(Effect.never)),
    onSome: (initialState) =>
      Effect.gen(function* hydratePecunia() {
        const root = yield* HtmlHydrate.hydrateEffect(
          PecuniaApp,
          Router.props(PecuniaRoute),
          target,
          initialState
        );

        yield* root.adopted;

        return yield* Effect.never;
      }),
  });

  return program.pipe(Effect.scoped, Effect.provide(runtimeLayer));
};
