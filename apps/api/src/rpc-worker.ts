import * as Cloudflare from "@alchemy.run/cloudflare";
import { eventFlags, Flags } from "@pecunia/core/flags";
import { DatabaseVendor } from "@pecunia/database";
import { D1Vendor } from "@pecunia/database/d1";
import {
  d1SqliteClientLayer,
  SqliteClient,
  SqliteClientError,
} from "@pecunia/database/sqlite-client";
import type { D1DatabaseLike } from "@pecunia/database/sqlite-client";
import { configFlagsLayer } from "@pecunia/flags/config";
import { retain } from "alchemy/RemovalPolicy";
import { Stage } from "alchemy/Stage";
import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Schema,
} from "effect";
import { identity } from "effect/Function";

import { privateObservability } from "../../site/src/observability.js";
import { pecuniaRpcHttpEffect, rpcProjection } from "./rpc-handler.js";
import { bindPlainSetting } from "./settings-binding.js";
import { WorkerRuntimeUnavailable } from "./worker-runtime-error.js";

export { rpcProjection } from "./rpc-handler.js";

const retainInProd =
  globalThis.__ALCHEMY_RUNTIME__ === true
    ? identity
    : retain(Stage.pipe(Effect.map((stage) => stage === "prod")));

const d1DatabaseOf = (vendor: DatabaseVendor["Service"]) =>
  Predicate.isTagged(vendor, "D1")
    ? Effect.succeed(vendor.database)
    : Effect.die("D1Vendor declares exactly one D1 database");

const isD1Database = (input: unknown): input is D1DatabaseLike =>
  Predicate.isObject(input) &&
  Predicate.hasProperty(input, "prepare") &&
  Predicate.isFunction(input.prepare) &&
  Predicate.hasProperty(input, "batch") &&
  Predicate.isFunction(input.batch);

const RuntimeEnvModule = Schema.Struct({
  env: Schema.Struct({
    ACCESS_AUDIENCE: Schema.optional(Schema.NonEmptyString),
    ACCESS_TEAM_DOMAIN: Schema.optional(Schema.NonEmptyString),
    DB: Schema.declare<D1DatabaseLike>(isD1Database),
  }),
});

const readRuntimeEnv = () =>
  Effect.tryPromise({
    catch: (cause) => new WorkerRuntimeUnavailable({ cause }),
    try: () => import("cloudflare:workers"),
  }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(RuntimeEnvModule)));

const unreadySqliteLayer = Layer.succeed(
  SqliteClient,
  SqliteClient.of({
    batch: (statements) =>
      Effect.fail(
        new SqliteClientError({
          cause:
            "DB binding is unavailable outside the Cloudflare Worker runtime",
          operation: "batch",
          sql: statements.map((statement) => statement.sql).join("; "),
        })
      ),
    execute: (sql) =>
      Effect.fail(
        new SqliteClientError({
          cause:
            "DB binding is unavailable outside the Cloudflare Worker runtime",
          operation: "execute",
          sql,
        })
      ),
    query: (sql) =>
      Effect.fail(
        new SqliteClientError({
          cause:
            "DB binding is unavailable outside the Cloudflare Worker runtime",
          operation: "query",
          sql,
        })
      ),
  })
);

const runtimeSqliteLayer =
  globalThis.__ALCHEMY_RUNTIME__ === true
    ? Layer.unwrap(
        readRuntimeEnv().pipe(
          Effect.map(({ env }) => d1SqliteClientLayer(env.DB)),
          Effect.orElseSucceed(() => unreadySqliteLayer)
        )
      )
    : unreadySqliteLayer;

const runtimeAccessSettings = (
  fallbackAudience: Option.Option<string>,
  fallbackTeamDomain: Option.Option<string>
) =>
  Effect.gen(function* resolveAccessSettings() {
    if (globalThis.__ALCHEMY_RUNTIME__ === true) {
      const runtime = yield* readRuntimeEnv().pipe(Effect.option);

      if (Option.isSome(runtime)) {
        const audience = runtime.value.env.ACCESS_AUDIENCE;
        const teamDomain = runtime.value.env.ACCESS_TEAM_DOMAIN;

        if (audience !== undefined && teamDomain !== undefined) {
          return { audience, teamDomain };
        }
      }
    }

    return Option.isSome(fallbackAudience) && Option.isSome(fallbackTeamDomain)
      ? {
          audience: fallbackAudience.value,
          teamDomain: fallbackTeamDomain.value,
        }
      : undefined;
  });

export default class PecuniaRpcBackend extends Cloudflare.Workers.RpcWorker<PecuniaRpcBackend>()(
  "PecuniaRpcBackend",
  {
    compatibility: { date: "2026-05-28" },
    main: import.meta.url,
    observability: privateObservability,
    schema: rpcProjection.group,
    workersDev: false,
  },
  Effect.gen(function* rpcBackendRuntime() {
    const host = yield* Cloudflare.Worker;

    const accessAudience = yield* Config.option(
      Config.String("ACCESS_AUDIENCE")
    );

    const accessTeamDomain = yield* Config.option(
      Config.String("ACCESS_TEAM_DOMAIN")
    );

    const publicOrigin = yield* Config.option(Config.String("PECUNIA_ORIGIN"));

    yield* bindPlainSetting(host, "ACCESS_AUDIENCE", accessAudience);

    yield* bindPlainSetting(host, "ACCESS_TEAM_DOMAIN", accessTeamDomain);

    yield* bindPlainSetting(host, "PUBLIC_ORIGIN", publicOrigin);

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

    const access = yield* runtimeAccessSettings(
      accessAudience,
      accessTeamDomain
    );

    // @effect-diagnostics-next-line returnEffectInGen:off -- Alchemy's RPC Worker initialization returns its request Effect.
    return pecuniaRpcHttpEffect(
      runtimeSqliteLayer,
      Layer.succeed(Flags, flags),
      access === undefined ? undefined : { access }
    );
  })
) {}
