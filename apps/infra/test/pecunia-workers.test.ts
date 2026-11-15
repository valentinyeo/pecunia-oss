import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { AuthProviders, Stage } from "alchemy";
import { AlchemyContextLive } from "alchemy/AlchemyContext";
import * as Output from "alchemy/Output";
import {
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Schema,
} from "effect";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as HttpClient from "effect/http/HttpClient";

import {
  MARKET_CRON,
  SWEEP_CRON,
  SYNC_CRON,
} from "../../sync/src/sync-worker.js";
import stack from "../alchemy.run.js";
import { pecuniaStackConfig } from "./pecunia-config.js";
import type { PecuniaStackConfig } from "./pecunia-config.js";

const services = Layer.mergeAll(
  AlchemyContextLive.pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        NodeServices.layer,
        SecureRandom.layerWebCrypto,
        Digest.layerWebCrypto
      )
    )
  ),
  Layer.succeed(Stage, "prod"),
  Layer.succeed(AuthProviders, {}),
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() =>
      Effect.die("pecunia-stack-declaration-must-not-call-provider")
    )
  )
);

const compiledStack = (config: PecuniaStackConfig = pecuniaStackConfig) =>
  stack.pipe(
    Effect.provide(
      Layer.mergeAll(
        services,
        ConfigProvider.layer(ConfigProvider.fromUnknown(config))
      )
    )
  );

const bindingsSchema = Schema.Struct({
  bindings: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      service: Schema.optionalKey(Schema.Unknown),
      text: Schema.optionalKey(Schema.String),
      type: Schema.String,
    })
  ),
});

const rowsOf = (bindings: readonly { readonly data: unknown }[] | undefined) =>
  (bindings ?? []).flatMap((binding) =>
    Option.match(Schema.decodeUnknownOption(bindingsSchema)(binding.data), {
      onNone: () => [],
      onSome: (rows) => rows.bindings,
    })
  );

const storageOf = (
  bindings: readonly { readonly data: unknown }[] | undefined
) =>
  [
    ...new Set(
      rowsOf(bindings)
        .filter((row) => row.type === "d1" || row.type === "r2_bucket")
        .map((row) => `${row.name}:${row.type}`)
    ),
  ].toSorted();

const schedulesOf = (
  bindings: readonly { readonly sid: string }[] | undefined
) =>
  [
    ...new Set(
      (bindings ?? [])
        .map((binding) => binding.sid)
        .filter((sid) => sid.startsWith("Cron("))
    ),
  ].toSorted();

it.effect(
  "declares Pecunia's database, documents bucket, and workers beside the template's resources",
  () =>
    Effect.gen(function* checkPecuniaResources() {
      const compiled = yield* compiledStack();
      const resources = Object.values(compiled.resources);

      const databases = resources
        .filter((resource) => resource.Type === "Cloudflare.D1Database")
        .map((resource) => resource.LogicalId)
        .filter((logicalId) => logicalId.startsWith("Pecunia"));

      expect(databases).toEqual(["Pecunia-d1"]);

      const buckets = resources
        .filter((resource) => resource.Type === "Cloudflare.R2.Bucket")
        .map((resource) => resource.LogicalId);

      expect(buckets).toEqual(
        expect.arrayContaining(["PecuniaDocuments", "MischiefCrashBucket"])
      );

      expect(
        yield* Effect.forEach(
          resources.filter((resource) => resource.Type === "Drizzle.Schema"),
          (resource) =>
            Schema.decodeUnknownEffect(Schema.Struct({ out: Schema.String }))(
              resource.Props
            )
        ).pipe(Effect.map((schemas) => schemas.map((schema) => schema.out)))
      ).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/packages\/database\/migrations\/d1\/$/u),
        ])
      );

      const workers = resources
        .filter((resource) => resource.Type === "Cloudflare.Worker")
        .map((resource) => resource.LogicalId);

      expect(workers).toEqual(
        expect.arrayContaining([
          "PecuniaRpcBackend",
          "McpEndpoint",
          "SyncWorker",
          "Website",
          "Mischief",
        ])
      );
    })
);

it.effect(
  "holds the database and documents bindings on Pecunia's backend alone",
  () =>
    Effect.gen(function* checkStorageHolder() {
      const { bindings } = yield* compiledStack();

      expect(storageOf(bindings.PecuniaRpcBackend)).toEqual([
        "DB:d1",
        "DOCUMENTS:r2_bucket",
      ]);

      expect(storageOf(bindings.SyncWorker)).toEqual([]);
      expect(storageOf(bindings.McpEndpoint)).toEqual([]);
    })
);

it.effect(
  "binds the sync worker and the MCP endpoint to Pecunia's backend",
  () =>
    Effect.gen(function* checkSurfaceBindings() {
      const compiled = yield* compiledStack();

      const upstreamOf = (logicalId: string) =>
        Effect.gen(function* checkServiceBinding() {
          const declared = yield* Schema.decodeUnknownEffect(bindingsSchema)(
            (compiled.bindings[logicalId] ?? []).find(
              (binding) => binding.sid === "BACKEND"
            )?.data
          );

          const backend = declared.bindings.find(
            (row) => row.type === "service" && row.name === "BACKEND"
          );

          expect(backend).toBeDefined();

          const upstream = yield* Schema.decodeUnknownEffect(
            Schema.Record(Schema.String, Schema.Unknown)
          )(Output.resolveUpstream(backend?.service));

          return Object.keys(upstream);
        });

      expect(yield* upstreamOf("SyncWorker")).toEqual(["PecuniaRpcBackend"]);
      expect(yield* upstreamOf("McpEndpoint")).toEqual(["PecuniaRpcBackend"]);
    })
);

it.effect(
  "gives the sync worker the three schedules and nothing that holds data",
  () =>
    Effect.gen(function* checkSyncWorker() {
      const { bindings } = yield* compiledStack();

      expect([SWEEP_CRON, SYNC_CRON, MARKET_CRON]).toEqual([
        "*/5 * * * *",
        "0 6,14,22 * * *",
        "30 5 * * *",
      ]);

      expect(schedulesOf(bindings.SyncWorker)).toEqual([
        "Cron(*/5 * * * *)",
        "Cron(0 6,14,22 * * *)",
        "Cron(30 5 * * *)",
      ]);

      expect(
        (bindings.SyncWorker ?? []).map((binding) => binding.sid).toSorted()
      ).toEqual([
        "BACKEND",
        "Cron(*/5 * * * *)",
        "Cron(0 6,14,22 * * *)",
        "Cron(30 5 * * *)",
      ]);
    })
);

it.effect.prop(
  "reads the public origin and the Access settings from configuration",
  {
    audience: Schema.String.check(Schema.isPattern(/^[a-z]{1,12}$/u)),
    team: Schema.String.check(Schema.isPattern(/^[a-z]{1,12}$/u)),
  },
  ({ audience, team }) =>
    Effect.gen(function* checkConfiguredSettings() {
      const origin = `https://pecunia.example.test/${team}`;
      const teamDomain = `https://${team}.cloudflareaccess.com`;

      const compiled = yield* compiledStack({
        ...pecuniaStackConfig,
        ACCESS_AUDIENCE: audience,
        ACCESS_TEAM_DOMAIN: teamDomain,
        PECUNIA_ORIGIN: origin,
      });

      const declared = Object.fromEntries(
        rowsOf(compiled.bindings.PecuniaRpcBackend ?? [])
          .filter((row) => row.type === "plain_text")
          .map((row) => [row.name, row.text])
      );

      expect(declared).toMatchObject({
        ACCESS_AUDIENCE: audience,
        ACCESS_TEAM_DOMAIN: teamDomain,
        PUBLIC_ORIGIN: origin,
      });
    }),
  { arbitrary: { runs: 4 }, timeout: 30_000 }
);

const accountId = /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/u;

const hostname = /https?:\/\/|\b[a-z0-9-]+\.(?:com|dev|io|net|org|sh)\b/iu;

const pecuniaWorkerFiles = new Set([
  "apps/api/src/mcp-worker.ts",
  "apps/api/src/rpc-worker.ts",
  "apps/sync/src/sync-worker.ts",
]);

const repoRoot = new URL("../../../", import.meta.url).pathname;

const sourceFiles = [
  "apps/api/src/mcp-worker.ts",
  "apps/api/src/rpc-worker.ts",
  "apps/infra/alchemy.preview.ts",
  "apps/infra/alchemy.run.ts",
  "apps/infra/src/preview.ts",
  "apps/infra/src/state-store.ts",
  "apps/infra/test/pecunia-config.ts",
  "apps/infra/test/pecunia-workers.test.ts",
  "apps/infra/test/provider-coverage.test.ts",
  "apps/infra/test/reader-binding.test.ts",
  "apps/infra/test/retention.test.ts",
  "apps/infra/test/state-store.test.ts",
  "apps/infra/test/website-manifest.test.ts",
  "apps/infra/test/website-workerd.ts",
  "apps/sync/src/sync-worker.ts",
];

const readSources = Effect.all(
  sourceFiles.map((source) =>
    Effect.gen(function* readSource() {
      const fs = yield* FileSystem.FileSystem;
      const text = yield* fs.readFileString(`${repoRoot}${source}`);

      return { path: source, text };
    })
  )
);

it.effect(
  "keeps account ids out of apps/infra and hostnames out of the Pecunia workers",
  () =>
    Effect.gen(function* checkNoLiterals() {
      const sources = yield* readSources;

      expect(sources.length).toBe(sourceFiles.length);

      for (const source of sources) {
        expect(
          source.text,
          `${source.path} declares an account id`
        ).not.toMatch(accountId);

        if (pecuniaWorkerFiles.has(source.path)) {
          expect(source.text, `${source.path} declares a hostname`).not.toMatch(
            hostname
          );
        }
      }
    }).pipe(Effect.provide(NodeServices.layer))
);
