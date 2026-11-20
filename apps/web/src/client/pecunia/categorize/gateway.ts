import { Clock, Context, Effect, Layer, Ref, Result } from "effect";

import { demoCatalog } from "./demo.js";
import { uuidV7At } from "./ids.js";
import type { CatalogSnapshot } from "./snapshot.js";
import { applyWrite } from "./write.js";
import type { CatalogWrite } from "./write.js";

export interface WriteOutcome {
  readonly catalog: CatalogSnapshot;
  readonly notice: string;
}

const make = Effect.gen(function* makeCategorizeGateway() {
  const state = yield* Ref.make<CatalogSnapshot>(demoCatalog);
  const counter = yield* Ref.make(1000);

  const read = Effect.fn("CategorizeGateway.read")(function* readCatalog() {
    return yield* Ref.get(state);
  });

  const write = Effect.fn("CategorizeGateway.write")(function* writeCatalog(
    change: CatalogWrite
  ) {
    const current = yield* Ref.get(state);
    const now = yield* Clock.currentTimeMillis;
    const next = yield* Ref.updateAndGet(counter, (value) => value + 1);

    const outcome = applyWrite(current, change, {
      newId: () => uuidV7At(now, next),
    });

    if (Result.isFailure(outcome)) {
      return yield* outcome.failure;
    }

    yield* Ref.set(state, outcome.success.catalog);

    return { catalog: outcome.success.catalog, notice: outcome.success.notice };
  });

  return { read, write } as const;
});

export class CategorizeGateway extends Context.Service<
  CategorizeGateway,
  Effect.Success<typeof make>
>()("@pecunia/web/CategorizeGateway", { make }) {
  static readonly layer = Layer.effect(this, this.make);
}
