import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { AuthProviders, Stage } from "alchemy";
import { AlchemyContextLive } from "alchemy/AlchemyContext";
import { ConfigProvider, Effect, Layer, Schema } from "effect";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as HttpClient from "effect/http/HttpClient";

import stack from "../alchemy.run.js";
import { configWithout, pecuniaStackConfig } from "./pecunia-config.js";

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
  Layer.succeed(AuthProviders, {}),
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make(() =>
      Effect.die("demo-stack-declaration-must-not-call-provider")
    )
  )
);

const compile = (
  config: Readonly<Record<string, string | boolean>>,
  stage = "prod"
) =>
  stack.pipe(
    Effect.provide(services),
    Effect.provideService(Stage, stage),
    Effect.provideService(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown(config)
    )
  );

const ratstackShResources = [
  "DmarcTxt",
  "DnsAidA2aSvcb",
  "DnsAidIndexSvcb",
  "DnsAidIndexTxt",
  "DnsAidMcpSvcb",
  "PostShibaDkimCname",
  "PostShibaReturnPathCname",
  "RatstackDnssec",
  "RatstackEmailRouting",
  "RatstackZone",
  "WorkshopForwardAddress",
  "WorkshopForwardRule",
] as const;

const nonDemoWorkers = [
  "McpEndpoint",
  "Mischief",
  "MischiefCrashTail",
  "PecuniaRpcBackend",
  "SyncWorker",
  "TurboCache",
  "Workshop",
] as const;

const demoResources = ["FeatureFlags/Store", "RpcBackend", "Website"] as const;

const websiteDomainSchema = Schema.Struct({
  domain: Schema.optionalKey(
    Schema.Struct({
      name: Schema.String,
      zoneName: Schema.optionalKey(Schema.String),
    })
  ),
  workersDev: Schema.Boolean,
});

const workersOf = (resources: Record<string, { Type: string }>) =>
  Object.entries(resources)
    .filter(([, resource]) => resource.Type === "Cloudflare.Worker")
    .map(([id]) => id)
    .toSorted();

it.effect(
  "DEMO_ONLY false declares the ratstack.sh resources and every worker",
  () =>
    Effect.gen(function* fullDeclaration() {
      const { resources } = yield* compile({
        ...pecuniaStackConfig,
        AUTH_ENABLED: false,
        DEMO_ONLY: false,
      });

      expect(Object.keys(resources).toSorted()).toEqual(
        expect.arrayContaining([...ratstackShResources, ...demoResources])
      );

      expect(
        Object.keys(resources).filter((id) => id.startsWith("TurboCache"))
      ).not.toEqual([]);

      expect(workersOf(resources)).toEqual(
        expect.arrayContaining(["Website", ...nonDemoWorkers])
      );
    })
);

it.effect(
  "DEMO_ONLY true keeps the Website and what it binds, nothing else",
  () =>
    Effect.gen(function* demoDeclaration() {
      const { resources } = yield* compile({
        ...pecuniaStackConfig,
        AUTH_ENABLED: false,
        DEMO_ONLY: true,
      });

      const ids = Object.keys(resources).toSorted();

      expect(ids).toEqual([...demoResources]);
      expect(workersOf(resources)).toEqual(["RpcBackend", "Website"]);
      expect(
        Object.values(resources).filter(
          (resource) =>
            resource.Type.startsWith("Cloudflare.DNS.") ||
            resource.Type.startsWith("Cloudflare.Email.") ||
            resource.Type.startsWith("Cloudflare.Zone.")
        )
      ).toEqual([]);
      expect(resources.Website?.Type).toBe("Cloudflare.Worker");
    })
);

it.effect.prop(
  "DEMO_ONLY decides the resource list in both directions and the domain follows PECUNIA_ORIGIN",
  {
    label: Schema.String.check(Schema.isPattern(/^[a-z]{1,12}$/u)),
    demoOnly: Schema.Boolean,
  },
  ({ label, demoOnly }) =>
    Effect.gen(function* flagDecides() {
      const host = `${label}.example.test`;

      const { resources } = yield* compile({
        ...pecuniaStackConfig,
        AUTH_ENABLED: false,
        DEMO_ONLY: demoOnly,
        PECUNIA_ORIGIN: `https://${host}`,
      });

      expect(resources.Website?.Props).toMatchObject({
        domain: { name: host },
        workersDev: false,
      });

      for (const id of ratstackShResources) {
        expect(id in resources, `${id} under DEMO_ONLY=${demoOnly}`).toBe(
          !demoOnly
        );
      }

      for (const id of nonDemoWorkers) {
        expect(id in resources, `${id} under DEMO_ONLY=${demoOnly}`).toBe(
          !demoOnly
        );
      }

      expect("Website" in resources).toBe(true);
    }),
  { arbitrary: { runs: 4 }, timeout: 120_000 }
);

it.effect("keeps the pr-<number> domain while PECUNIA_ORIGIN is unset", () =>
  Effect.gen(function* previewDomain() {
    const preview = yield* compile(
      {
        ...configWithout("PECUNIA_ORIGIN"),
        AUTH_ENABLED: false,
        PREVIEW_COMMIT: "a".repeat(40),
      },
      "pr-7"
    );

    expect(
      yield* Schema.decodeUnknownEffect(websiteDomainSchema)(
        preview.resources.Website?.Props
      )
    ).toEqual({
      domain: { name: "pr-7.ratstack.sh", zoneName: "ratstack.sh" },
      workersDev: false,
    });

    const overridden = yield* compile(
      {
        ...pecuniaStackConfig,
        AUTH_ENABLED: false,
        PREVIEW_COMMIT: "a".repeat(40),
      },
      "pr-7"
    );

    expect(
      yield* Schema.decodeUnknownEffect(websiteDomainSchema)(
        overridden.resources.Website?.Props
      )
    ).toEqual({
      domain: { name: "pecunia.example.test" },
      workersDev: false,
    });
  })
);
