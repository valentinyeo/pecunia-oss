import { NodeServices } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { AuthProviders, Stage } from "alchemy";
import { AlchemyContextLive } from "alchemy/AlchemyContext";
import { ConfigProvider, Effect, Layer } from "effect";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as HttpClient from "effect/http/HttpClient";

import pecuniaStack from "../pecunia.run.js";

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
      Effect.die("pecunia-standalone-stack-must-not-call-provider")
    )
  )
);

const compileStandalone = (config: Readonly<Record<string, string>>) =>
  pecuniaStack.pipe(
    Effect.provide(
      Layer.mergeAll(
        services,
        ConfigProvider.layer(ConfigProvider.fromUnknown(config))
      )
    )
  );

it.effect(
  "declares only Pecunia Cloudflare resources without ratstack.sh DNS, mail, Mischief, or Workshop",
  () =>
    Effect.gen(function* checkStandaloneStack() {
      const compiled = yield* compileStandalone({
        MCP_BEARER_TOKEN: "demo-mcp-secret",
        PECUNIA_STANDALONE: "true",
      });

      const resources = Object.values(compiled.resources);

      const workers = resources
        .filter((resource) => resource.Type === "Cloudflare.Worker")
        .map((resource) => resource.LogicalId)
        .toSorted();

      expect(workers).toEqual([
        "McpEndpoint",
        "PecuniaRpcBackend",
        "SyncWorker",
        "Website",
      ]);

      const zones = resources.filter(
        (resource) => resource.Type === "Cloudflare.Zone"
      );

      expect(zones).toEqual([]);

      const dnsRecords = resources.filter(
        (resource) => resource.Type === "Cloudflare.DNS.Record"
      );

      expect(dnsRecords).toEqual([]);

      const databases = resources
        .filter((resource) => resource.Type === "Cloudflare.D1Database")
        .map((resource) => resource.LogicalId);

      expect(databases).toEqual(["Pecunia-d1"]);
    })
);
