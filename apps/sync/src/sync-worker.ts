import * as Cloudflare from "@alchemy.run/cloudflare";
import PecuniaRpcBackend from "@pecunia/api/rpc-worker";
import {
  demoBaseCurrency,
  demoMarketLayer,
  demoQuotes,
  marketRefreshRequestOf,
  runMarketRefresh,
} from "@pecunia/market";
import { Clock, Effect, Layer } from "effect";
import { HttpServerResponse } from "effect/http";

import { privateObservability } from "../../site/src/observability.js";

export const SWEEP_CRON = "*/5 * * * *";

export const SYNC_CRON = "0 6,14,22 * * *";

export const MARKET_CRON = "30 5 * * *";

const scheduledWorkLandsWithSync =
  "Pecunia's sweep, sync, and market schedules are registered. The jobs land with the bank sync surface.";

interface SyncWorkerBindings {
  readonly BACKEND: typeof PecuniaRpcBackend;
}

export const syncWorkerProps = {
  compatibility: { date: "2026-05-28" },
  env: { BACKEND: PecuniaRpcBackend } satisfies SyncWorkerBindings,
  main: import.meta.url,
  observability: privateObservability,
  workersDev: false,
} satisfies Omit<Cloudflare.Workers.WorkerProps<SyncWorkerBindings>, "env"> & {
  readonly env: SyncWorkerBindings;
};

const refreshDemoMarket = Effect.gen(function* refreshDemoMarket() {
  const now = yield* Clock.currentTimeMillis;

  const summary = yield* runMarketRefresh(
    marketRefreshRequestOf({
      base: demoBaseCurrency,
      epochMillis: now,
      quotes: demoQuotes,
    })
  );

  yield* Effect.logInfo(
    `market refresh for ${summary.asOf}: ${summary.quotes} rates (${summary.cached ? "cached" : "fresh"}), ${summary.priced} prices`
  );
});

export default class SyncWorker extends Cloudflare.Worker<SyncWorker>()(
  "SyncWorker",
  syncWorkerProps,
  Effect.gen(function* syncWorkerRuntime() {
    const cron = yield* Cloudflare.Workers.CronEventSource;

    const market = yield* Layer.build(demoMarketLayer);

    yield* cron(SWEEP_CRON, () => Effect.void);
    yield* cron(SYNC_CRON, () => Effect.void);
    yield* cron(MARKET_CRON, () =>
      refreshDemoMarket.pipe(
        Effect.provide(market),
        Effect.tapError((error) =>
          Effect.logWarning(`market refresh unavailable: ${error._tag}`)
        ),
        Effect.ignore
      )
    );

    return {
      fetch: Effect.succeed(
        HttpServerResponse.text(scheduledWorkLandsWithSync, { status: 501 })
      ),
    };
  }).pipe(Effect.provide(Cloudflare.Workers.CronEventSourceLive))
) {}
