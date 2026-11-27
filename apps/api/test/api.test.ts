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
import { ProviderAccountIdSchema as ImportAccountIdSchema } from "@pecunia/core/bank-import";
import { eventFlags, Flags } from "@pecunia/core/flags";
import { ProfileIdSchema as CoreProfileIdSchema } from "@pecunia/core/settings";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { ProfileIdSchema as InvestmentProfileIdSchema } from "@pecunia/investments/model";
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
import { Clock, Effect, Layer, Option, Predicate, Schema } from "effect";
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

        const investmentProfileId = yield* Schema.decodeEffect(
          InvestmentProfileIdSchema
        )(seededProfileId);

        const portfolio = yield* client.readInvestmentPortfolio({
          profileId: investmentProfileId,
        });

        expect(portfolio.valuedCount).toBe(2);
        expect(portfolio.unknownCount).toBe(1);

        const coreProfileId =
          yield* Schema.decodeEffect(CoreProfileIdSchema)(seededProfileId);

        const targets = yield* client.listImportTargets({
          profileId: coreProfileId,
        });

        expect(targets.some((target) => target.label === "Demo Bank")).toBe(
          true
        );

        const demoBankId = yield* Schema.decodeEffect(ImportAccountIdSchema)(
          "0192f0c1-0006-7b7b-8ffd-ffde623dd8df"
        );

        const imported = yield* client.importBankFile({
          accountId: demoBankId,
          content: [
            "date,description,amount_minor,currency,reference",
            "2025-11-18,Demo Stationery,-1950,EUR,INV-101",
          ].join("\n"),
          fileName: "api-test.csv",
          profileId: coreProfileId,
        });

        expect(imported.imported).toBe(1);
        expect(imported.alreadyImported).toBe(0);
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
            "readInvestmentPortfolio",
            "importBankFile",
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

const base64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

interface AccessJwtPayload {
  readonly aud: readonly string[];
  readonly email: string;
  readonly exp: number;
  readonly iat: number;
  readonly iss: string;
  readonly sub: string;
}

const signAccessJwt = (
  privateKey: Parameters<typeof crypto.subtle.sign>[1],
  kid: string,
  payload: AccessJwtPayload
) =>
  Effect.gen(function* signJwt() {
    const encoder = new TextEncoder();

    const header = base64Url(
      encoder.encode(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }))
    );

    const body = base64Url(encoder.encode(JSON.stringify(payload)));
    const signingInput = `${header}.${body}`;

    const signature = yield* Effect.promise(() =>
      crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        privateKey,
        encoder.encode(signingInput)
      )
    );

    return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
  });

describe("Cloudflare Zero Trust Access JWT enforcement on browser /rpc", () => {
  it.live(
    "rejects missing/wrong-audience JWTs with 401 and enforces D1 owner vs viewer roles from Cf-Access-Jwt-Assertion",
    () =>
      Effect.gen(function* testZeroTrustAccess() {
        const keyPair = yield* Effect.promise(() =>
          crypto.subtle.generateKey(
            {
              hash: "SHA-256",
              modulusLength: 2048,
              name: "RSASSA-PKCS1-v1_5",
              publicExponent: new Uint8Array([1, 0, 1]),
            },
            true,
            ["sign", "verify"]
          )
        );

        const publicJwk = yield* Effect.promise(() =>
          crypto.subtle.exportKey("jwk", keyPair.publicKey)
        );

        const kid = "demo-zt-key-1";
        const teamDomain = "example.cloudflareaccess.com";
        const audience = "demo-pecunia-aud-tag";

        const jwksFetchLayer = Layer.succeed(FetchHttpClient.Fetch, () =>
          Promise.resolve(
            Response.json(
              {
                keys: [
                  {
                    alg: "RS256",
                    e: publicJwk.e,
                    kid,
                    kty: "RSA",
                    n: publicJwk.n,
                    use: "sig",
                  },
                ],
              },
              { status: 200 }
            )
          )
        );

        const today = yield* Schema.decodeEffect(DateOnlySchema)("2025-12-15");

        const rpcServer = yield* Effect.acquireRelease(
          Effect.sync(() =>
            pecuniaRpcWebHandler(
              openDemoSqliteLayer(),
              Flags.defaults(eventFlags),
              {
                access: { audience, teamDomain },
                httpClientLayer: FetchHttpClient.layer.pipe(
                  Layer.provide(jwksFetchLayer)
                ),
                today,
              }
            )
          ),
          (handle) => Effect.promise(() => handle.dispose())
        );

        const missingTokenResponse = yield* Effect.promise(() =>
          rpcServer.handler(
            new Request("http://pecunia-rpc.test/rpc", {
              body: "[]",
              headers: {
                "Content-Type": "application/json",
                "x-pecunia-surface": "browser",
              },
              method: "POST",
            })
          )
        );

        expect(missingTokenResponse.status).toBe(401);

        const nowSeconds = Math.floor((yield* Clock.currentTimeMillis) / 1000);

        const wrongAudToken = yield* signAccessJwt(keyPair.privateKey, kid, {
          aud: ["wrong-application-aud"],
          email: "demo@example.com",
          exp: nowSeconds + 600,
          iat: nowSeconds - 10,
          iss: `https://${teamDomain}`,
          sub: "sub-owner-1",
        });

        const wrongAudResponse = yield* Effect.promise(() =>
          rpcServer.handler(
            new Request("http://pecunia-rpc.test/rpc", {
              body: "[]",
              headers: {
                "Cf-Access-Jwt-Assertion": wrongAudToken,
                "Content-Type": "application/json",
                "x-pecunia-surface": "browser",
              },
              method: "POST",
            })
          )
        );

        expect(wrongAudResponse.status).toBe(401);

        const ownerToken = yield* signAccessJwt(keyPair.privateKey, kid, {
          aud: [audience],
          email: "demo@example.com",
          exp: nowSeconds + 600,
          iat: nowSeconds - 10,
          iss: `https://${teamDomain}`,
          sub: "sub-owner-1",
        });

        const ownerClient = yield* makeRpcClientFor((request) => {
          const headers = new Headers(request.headers);

          headers.set("x-pecunia-surface", "browser");
          headers.set("Cf-Access-Jwt-Assertion", ownerToken);

          return rpcServer.handler(new Request(request, { headers }));
        });

        const reportProfileId = yield* Schema.decodeEffect(
          ReportProfileIdSchema
        )(seededProfileId);

        const ownerDashboard = yield* ownerClient.readDashboard({
          period: PeriodChoiceSchema.cases.All.make({}),
          profileId: reportProfileId,
        });

        expect(ownerDashboard.totals.incomeMinor).toBe(480_000);

        const viewerToken = yield* signAccessJwt(keyPair.privateKey, kid, {
          aud: [audience],
          email: "finance@example.com",
          exp: nowSeconds + 600,
          iat: nowSeconds - 10,
          iss: `https://${teamDomain}`,
          sub: "sub-viewer-1",
        });

        const viewerClient = yield* makeRpcClientFor((request) => {
          const headers = new Headers(request.headers);

          headers.set("x-pecunia-surface", "browser");
          headers.set("Cf-Access-Jwt-Assertion", viewerToken);

          return rpcServer.handler(new Request(request, { headers }));
        });

        const viewerDashboard = yield* viewerClient.readDashboard({
          period: PeriodChoiceSchema.cases.All.make({}),
          profileId: reportProfileId,
        });

        expect(viewerDashboard.totals.incomeMinor).toBe(480_000);

        const bankProfileId = yield* Schema.decodeEffect(
          BankLineProfileIdSchema
        )(seededProfileId);

        const lineId = yield* Schema.decodeEffect(BankLineIdSchema)(
          "0192f0c1-0031-7ab6-8c3b-c3bb339364f8"
        );

        const viewerWriteError = yield* viewerClient
          .editBankLine({
            category: CategoryChangeSchema.cases.Unchanged.make({}),
            lineId,
            note: NoteChangeSchema.cases.Set.make({ text: "Should be denied" }),
            profileId: bankProfileId,
          })
          .pipe(Effect.flip);

        expect(viewerWriteError._tag).toBe("Forbidden");
      })
  );
});
