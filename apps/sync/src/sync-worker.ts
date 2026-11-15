import * as Cloudflare from "@alchemy.run/cloudflare";
import PecuniaRpcBackend from "@pecunia/api/rpc-worker";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/http";

import { privateObservability } from "../../site/src/observability.js";

export const SWEEP_CRON = "*/5 * * * *";

export const SYNC_CRON = "0 6,14,22 * * *";

export const MARKET_CRON = "30 5 * * *";

const scheduledWorkLandsWithSync =
  "Pecunia's sweep, sync, and market schedules are registered. The jobs land with the bank sync surface.";

export default class SyncWorker extends Cloudflare.Worker<SyncWorker>()(
  "SyncWorker",
  {
    compatibility: { date: "2026-05-28" },
    env: { BACKEND: PecuniaRpcBackend },
    main: import.meta.url,
    observability: privateObservability,
    workersDev: false,
  },
  Effect.gen(function* syncWorkerRuntime() {
    const cron = yield* Cloudflare.Workers.CronEventSource;

    yield* cron(SWEEP_CRON, () => Effect.void);
    yield* cron(SYNC_CRON, () => Effect.void);
    yield* cron(MARKET_CRON, () => Effect.void);

    return {
      fetch: Effect.succeed(
        HttpServerResponse.text(scheduledWorkLandsWithSync, { status: 501 })
      ),
    };
  }).pipe(Effect.provide(Cloudflare.Workers.CronEventSourceLive))
) {}
