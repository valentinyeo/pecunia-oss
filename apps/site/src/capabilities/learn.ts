import { LearnError } from "@pecunia/core/learn";
import { Learner } from "@pecunia/learn/learner";
import { Effect, Layer } from "effect";

import { ContentStore } from "../content-store.js";

export { learnCapabilities } from "@pecunia/learn/capabilities";

export const learnLayer = Layer.unwrap(
  ContentStore.pipe(
    Effect.map((store) =>
      Learner.layer(
        store.learnDeck.pipe(
          Effect.mapError(
            () =>
              new LearnError({
                id: "deck",
                reason:
                  "Unable to read the public deck; retry after content assets recover.",
              })
          )
        )
      )
    )
  )
);
