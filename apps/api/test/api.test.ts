import { describe, expect, it } from "@effect/vitest";
import {
  BankLineIdSchema,
  CategoryChangeSchema,
  CategoryFilterSchema,
  NoteChangeSchema,
  ProfileIdSchema as BankLineProfileIdSchema,
  ReviewFilterSchema,
  SearchTextSchema,
} from "@pecunia/bank-lines/model";
import { eventFlags, Flags } from "@pecunia/core/flags";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import {
  DateOnlySchema,
  PeriodChoiceSchema,
  ProfileIdSchema as ReportProfileIdSchema,
} from "@pecunia/reporting";
import {
  ProfileIdSchema as SubProfileIdSchema,
  StatusChangeSchema,
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
} from "@pecunia/subscriptions";
import { Effect, Layer, Option, Predicate, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

import { pecuniaRpcGroup } from "../src/contracts.js";
import { mcpWebHandler } from "../src/mcp-handler.js";
import { pecuniaRpcWebHandler } from "../src/rpc-handler.js";

const seededProfileId = "0192f0c1-0001-702d-8484-48490b729601";

type JsonRpcRequest =
  | {
      readonly id: number;
      readonly jsonrpc: "2.0";
      readonly method: "initialize";
      readonly params: {
        readonly capabilities: Readonly<Record<string, never>>;
        readonly clientInfo: {
          readonly name: string;
          readonly version: string;
        };
        readonly protocolVersion: string;
      };
    }
  | {
      readonly id: number;
      readonly jsonrpc: "2.0";
      readonly method: "tools/list";
    }
  | {
      readonly id: number;
      readonly jsonrpc: "2.0";
      readonly method: "tools/call";
      readonly params: {
        readonly arguments: Readonly<Record<string, never>>;
        readonly name: string;
      };
    };

const acquireDemoRpcServer = () =>
  Effect.gen(function* startDemoRpc() {
    const today = yield* Schema.decodeEffect(DateOnlySchema)("2025-12-15");

    return yield* Effect.acquireRelease(
      Effect.sync(() =>
        pecuniaRpcWebHandler(
          openDemoSqliteLayer(),
          Flags.defaults(eventFlags),
          {
            today,
          }
        )
      ),
      (handle) => Effect.promise(() => handle.dispose())
    );
  });

const acquireMcpHandler = (
  backendFetch: (request: Request) => Promise<Response>,
  token: Option.Option<string>
) =>
  Effect.acquireRelease(
    Effect.sync(() => mcpWebHandler(backendFetch, token)),
    (handle) => Effect.promise(() => handle.dispose())
  );

const makeRpcClientFor = (handler: (request: Request) => Promise<Response>) => {
  const fetchLayer = Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
    handler(new Request(input, init))
  );

  const protocolLayer = RpcClient.layerProtocolHttp({
    url: "http://pecunia-rpc.test/rpc",
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

const mcpPost = (
  body: JsonRpcRequest,
  headers: Readonly<Record<string, string>> = {}
) =>
  new Request("http://mcp.test/mcp", {
    body: JSON.stringify(body),
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    method: "POST",
  });

const parseMcpJson = (response: Response) =>
  Effect.gen(function* readJson() {
    const text = yield* Effect.promise(() => response.text());
    const contentType = response.headers.get("content-type") ?? "";

    const payload = contentType.includes("text/event-stream")
      ? (text
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).trim())
          .find((line) => line.length > 0) ?? "")
      : text;

    return yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
      payload
    );
  });

describe("PecuniaRpcBackend over migrated demo SQLite", () => {
  it.effect(
    "serves settings, bank lines, subscriptions, and dashboard reports over HTTP RPC and persists mutations",
    () =>
      Effect.gen(function* testRpcEndToEnd() {
        const rpcServer = yield* acquireDemoRpcServer();
        const client = yield* makeRpcClientFor(rpcServer.handler);

        const setup = yield* client.readSetup({});

        expect(setup.profiles).toHaveLength(2);
        expect(setup.setting?.locale).toBe("en-GB");

        const reportProfileId = yield* Schema.decodeEffect(
          ReportProfileIdSchema
        )(seededProfileId);

        const dashboard = yield* client.readDashboard({
          period: PeriodChoiceSchema.cases.All.make({}),
          profileId: reportProfileId,
        });

        expect(dashboard.totals.incomeMinor).toBe(480_000);
        expect(dashboard.taxOwed.minor).toBe(312_500);

        const bankProfileId = yield* Schema.decodeEffect(
          BankLineProfileIdSchema
        )(seededProfileId);

        const emptySearch = yield* Schema.decodeEffect(SearchTextSchema)("");

        const lines = yield* client.listBankLines({
          cursor: Option.none(),
          filter: {
            account: Option.none(),
            amount: Option.none(),
            category: CategoryFilterSchema.cases.Any.make({}),
            direction: Option.none(),
            occurred: Option.none(),
            review: ReviewFilterSchema.cases.Any.make({}),
          },
          limit: 20,
          profileId: bankProfileId,
          search: emptySearch,
        });

        expect(lines.lines).toHaveLength(12);

        const lineId = yield* Schema.decodeEffect(BankLineIdSchema)(
          "0192f0c1-0031-7ab6-8c3b-c3bb339364f8"
        );

        const edited = yield* client.editBankLine({
          category: CategoryChangeSchema.cases.Unchanged.make({}),
          lineId,
          note: NoteChangeSchema.cases.Set.make({ text: "Edited via RPC" }),
          profileId: bankProfileId,
        });

        expect(edited.note).toBe("Edited via RPC");

        const subProfileId =
          yield* Schema.decodeEffect(SubProfileIdSchema)(seededProfileId);

        const cloudSubId = yield* Schema.decodeEffect(SubscriptionIdSchema)(
          "0192f0c1-0033-7362-801a-01a8162ef271"
        );

        const cancelled = yield* client.changeSubscriptionStatus({
          change: StatusChangeSchema.cases.Cancel.make({}),
          profileId: subProfileId,
          subscriptionId: cloudSubId,
        });

        expect(Predicate.isTagged(cancelled.status, "Cancelled")).toBe(true);

        const activeSubs = yield* client.listSubscriptions({
          filter: SubscriptionFilterSchema.cases.Active.make({}),
          profileId: subProfileId,
        });

        expect(activeSubs.subscriptions).toHaveLength(0);
      })
  );
});

describe("McpEndpoint bearer auth and BACKEND RPC projection", () => {
  it.effect(
    "returns 503 when MCP_BEARER_TOKEN is unconfigured and 401 on missing or wrong tokens",
    () =>
      Effect.gen(function* testMcpAuthFailures() {
        const rpcServer = yield* acquireDemoRpcServer();

        const unconfigured = yield* acquireMcpHandler(
          rpcServer.handler,
          Option.none()
        );

        const unconfiguredResponse = yield* unconfigured.handle(
          mcpPost({ id: 1, jsonrpc: "2.0", method: "tools/list" })
        );

        expect(unconfiguredResponse.status).toBe(503);

        const protectedMcp = yield* acquireMcpHandler(
          rpcServer.handler,
          Option.some("demo-secret-token")
        );

        const missingHeader = yield* protectedMcp.handle(
          mcpPost({ id: 1, jsonrpc: "2.0", method: "tools/list" })
        );

        expect(missingHeader.status).toBe(401);
        expect(missingHeader.headers.get("www-authenticate")).toBe("Bearer");

        const wrongToken = yield* protectedMcp.handle(
          mcpPost(
            { id: 1, jsonrpc: "2.0", method: "tools/list" },
            { Authorization: "Bearer wrong-token" }
          )
        );

        expect(wrongToken.status).toBe(401);
      })
  );

  it.effect(
    "lists projected Pecunia tools and executes readSetup over BACKEND RPC",
    () =>
      Effect.gen(function* testMcpTools() {
        const rpcServer = yield* acquireDemoRpcServer();

        const mcp = yield* acquireMcpHandler(
          rpcServer.handler,
          Option.some("demo-secret-token")
        );

        const auth = { Authorization: "Bearer demo-secret-token" };

        const initResponse = yield* mcp.handle(
          mcpPost(
            {
              id: 1,
              jsonrpc: "2.0",
              method: "initialize",
              params: {
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" },
                protocolVersion: "2025-06-18",
              },
            },
            auth
          )
        );

        expect(initResponse.status).toBe(200);

        const sessionId = initResponse.headers.get("mcp-session-id");

        const sessionHeaders =
          sessionId === null
            ? auth
            : {
                ...auth,
                "MCP-Protocol-Version": "2025-06-18",
                "Mcp-Session-Id": sessionId,
              };

        const listResponse = yield* mcp.handle(
          mcpPost(
            { id: 2, jsonrpc: "2.0", method: "tools/list" },
            sessionHeaders
          )
        );

        expect(listResponse.status).toBe(200);

        const listPayload = yield* parseMcpJson(listResponse);

        const parsedList = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            result: Schema.Struct({
              tools: Schema.Array(Schema.Struct({ name: Schema.String })),
            }),
          })
        )(listPayload);

        const toolNames = parsedList.result.tools.map((tool) => tool.name);

        expect(toolNames).toEqual(
          expect.arrayContaining([
            "readSetup",
            "listBankLines",
            "listSubscriptions",
            "readDashboard",
            "spendingSummary",
          ])
        );

        const callResponse = yield* mcp.handle(
          mcpPost(
            {
              id: 3,
              jsonrpc: "2.0",
              method: "tools/call",
              params: {
                arguments: {},
                name: "readSetup",
              },
            },
            sessionHeaders
          )
        );

        expect(callResponse.status).toBe(200);

        const callPayload = yield* parseMcpJson(callResponse);

        const parsedCall = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            result: Schema.Struct({
              content: Schema.Array(
                Schema.Struct({ text: Schema.String, type: Schema.String })
              ),
            }),
          })
        )(callPayload);

        expect(parsedCall.result.content[0]?.text).toContain("Example Ltd");
      })
  );
});
