import * as Cloudflare from "@alchemy.run/cloudflare";
import { toRpc } from "@pecunia/capability/rpc";
import { flagCapabilities } from "@pecunia/core/flag-capabilities";
import { eventFlags, Flags } from "@pecunia/core/flags";
import { DatabaseVendor } from "@pecunia/database";
import { D1Vendor } from "@pecunia/database/d1";
import { configFlagsLayer } from "@pecunia/flags/config";
import { retain } from "alchemy/RemovalPolicy";
import { Stage } from "alchemy/Stage";
import { Config, Context, Effect, Layer, Predicate } from "effect";
import { identity } from "effect/Function";
import { RpcSerialization, RpcServer } from "effect/rpc";

import { privateObservability } from "../../site/src/observability.js";

const retainInProd =
  globalThis.__ALCHEMY_RUNTIME__ === true
    ? identity
    : retain(Stage.pipe(Effect.map((stage) => stage === "prod")));

const d1DatabaseOf = (vendor: DatabaseVendor["Service"]) =>
  Predicate.isTagged(vendor, "D1")
    ? Effect.succeed(vendor.database)
    : Effect.die("D1Vendor declares exactly one D1 database");

export const rpcProjection = toRpc(flagCapabilities);

export default class PecuniaRpcBackend extends Cloudflare.Workers.RpcWorker<PecuniaRpcBackend>()(
  "PecuniaRpcBackend",
  {
    compatibility: { date: "2026-05-28" },
    env: {
      ACCESS_AUDIENCE: Config.String("ACCESS_AUDIENCE"),
      ACCESS_TEAM_DOMAIN: Config.String("ACCESS_TEAM_DOMAIN"),
      PUBLIC_ORIGIN: Config.String("PECUNIA_ORIGIN"),
    },
    main: import.meta.url,
    observability: privateObservability,
    schema: rpcProjection.group,
    workersDev: false,
  },
  Effect.gen(function* rpcBackendRuntime() {
    const host = yield* Cloudflare.Worker;

    const vendor = Context.get(
      yield* Layer.build(D1Vendor({ id: "Pecunia" })).pipe(retainInProd),
      DatabaseVendor
    );

    const database = yield* d1DatabaseOf(vendor);

    yield* host.bind`${database}`({
      bindings: [{ databaseId: database.databaseId, name: "DB", type: "d1" }],
    });

    const documents = yield* Cloudflare.R2.Bucket("PecuniaDocuments", {}).pipe(
      retainInProd
    );

    yield* host.bind`${documents}`({
      bindings: [
        {
          bucketName: documents.bucketName,
          name: "DOCUMENTS",
          type: "r2_bucket",
        },
      ],
    });

    const flags = yield* Flags.pipe(
      Effect.provide(configFlagsLayer(eventFlags))
    );

    // @effect-diagnostics-next-line returnEffectInGen:off -- Alchemy's RPC Worker initialization returns its request Effect.
    return RpcServer.toHttpEffect(rpcProjection.group).pipe(
      Effect.provide(
        Layer.mergeAll(rpcProjection.layer, RpcSerialization.layerJson).pipe(
          Layer.provide(Layer.succeed(Flags, flags))
        )
      )
    );
  })
) {}
