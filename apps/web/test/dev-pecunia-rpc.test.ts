import { describe, expect, it } from "@effect/vitest";
import { pecuniaRpcGroup } from "@pecunia/api/contracts";
import {
  PeriodChoiceSchema,
  ProfileIdSchema as ReportProfileIdSchema,
} from "@pecunia/reporting";
import { Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { backend } from "../src/dev/backend.js";

const seededProfileId = "0192f0c1-0001-702d-8484-48490b729601";

const makeDevClient = () => {
  const fetchLayer = Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
    backend(new Request(input, init))
  );

  const protocolLayer = RpcClient.layerProtocolHttp({
    url: "http://dev.test/app/rpc",
  }).pipe(
    Layer.provide([
      FetchHttpClient.layer.pipe(Layer.provide(fetchLayer)),
      RpcSerialization.layerJson,
    ])
  );

  return RpcClient.make(pecuniaRpcGroup.group).pipe(
    Effect.provide(protocolLayer)
  );
};

describe("dev backend /app/rpc", () => {
  it.effect(
    "serves Pecunia setup and dashboard sums from the migrated demo SQLite book",
    () =>
      Effect.gen(function* testDevPecuniaRpc() {
        const client = yield* makeDevClient();

        const setup = yield* client.readSetup({});

        expect(setup.profiles.map((profile) => profile.name)).toEqual([
          "Example Ltd",
          "Demo Person",
        ]);
        expect(setup.setting?.locale).toBe("en-GB");

        const profileId = yield* Schema.decodeEffect(ReportProfileIdSchema)(
          seededProfileId
        );

        const dashboard = yield* client.readDashboard({
          period: PeriodChoiceSchema.cases.All.make({}),
          profileId,
        });

        expect(dashboard.totals.incomeMinor).toBe(480_000);
        expect(dashboard.totals.spendMinor).toBe(328_955);
        expect(dashboard.taxOwed.minor).toBe(312_500);
      })
  );
});
