import { Effect } from "effect";
import { Runtime } from "foldkit";

import { installOverlay } from "#devtools-overlay";

import { view } from "../features/reader.js";
import { DocumentQueries } from "./docs/queries.js";
import { isAppPath } from "./mount.js";
import { browserInit } from "./reader/init.js";
import { Message } from "./reader/message.js";
import { Model, ReaderFlags } from "./reader/model.js";
import { subscriptions } from "./reader/subscriptions.js";
import { update } from "./reader/update.js";

import "../../../site/src/rat.css";
import "./reader.css";

const container = document.querySelector<HTMLElement>("#root");

const readerApplication = () =>
  Runtime.makeApplication({
    Flags: ReaderFlags,
    Model,
    container,
    devTools: import.meta.env.DEV ? { Message } : false,
    init: browserInit,
    resources: DocumentQueries.layer,
    subscriptions,
    update,
    view,
  });

const start = () => {
  if (isAppPath(window.location.pathname)) {
    void Effect.runPromise(
      Effect.promise(() => import("./pecunia/application.js")).pipe(
        Effect.flatMap(({ pecuniaApplication }) =>
          Effect.sync(() => {
            Runtime.hydrate(pecuniaApplication(container));
          })
        )
      )
    );

    return;
  }

  Runtime.hydrate(readerApplication());
};

installOverlay();

start();
