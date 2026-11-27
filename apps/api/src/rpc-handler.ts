import {
  CurrentPerson,
  JwksCache,
  PersonSchema,
  resolvePerson,
  verifyAccess,
} from "@pecunia/access";
import type { AccessSettings, Person } from "@pecunia/access";
import { toRpc } from "@pecunia/capability/rpc";
import type { Flags } from "@pecunia/core/flags";
import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { D1ReportSourceOptions } from "@pecunia/reporting/d1";
import {
  Context,
  Effect,
  Layer,
  Option,
  Predicate,
  Result,
  Schema,
} from "effect";
import {
  FetchHttpClient,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";

import {
  pecuniaRpcCapabilities,
  pecuniaServicesLayer,
} from "./capabilities.js";

export const rpcProjection = toRpc(pecuniaRpcCapabilities);

export interface PecuniaHandlerOptions extends D1ReportSourceOptions {
  readonly access?: AccessSettings;
  readonly httpClientLayer?: typeof FetchHttpClient.layer;
}

const MemberRowSchema = Schema.Struct({
  email: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  profile_id: Schema.NonEmptyString,
  role: Schema.Literals(["owner", "viewer"]),
});

const IdRowSchema = Schema.Struct({
  id: Schema.NonEmptyString,
});

const anonymousPerson = Schema.decodeSync(PersonSchema)({
  email: "anonymous@example.invalid",
  memberships: [],
  personId: "person-anonymous",
});

const normalizeTeamDomain = (teamDomain: string): string =>
  teamDomain
    .trim()
    .replace(/^https?:\/\//iu, "")
    .replace(/\/+$/u, "");

const extractCookieToken = (
  cookieHeader: string | undefined,
  cookieName: string
): string | undefined => {
  if (cookieHeader === undefined || cookieHeader.length === 0) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const prefix = `${cookieName}=`;

    if (trimmed.startsWith(prefix)) {
      const value = trimmed.slice(prefix.length).trim();

      return value.length > 0 ? value : undefined;
    }
  }

  return undefined;
};

const extractAccessJwt = (
  request: HttpServerRequest.HttpServerRequest
): string | undefined => {
  const headerToken = request.headers["cf-access-jwt-assertion"]?.trim();

  if (headerToken !== undefined && headerToken.length > 0) {
    return headerToken;
  }

  return extractCookieToken(request.headers.cookie, "CF_Authorization");
};

const decodePerson = (
  personId: string,
  email: string,
  memberships: readonly {
    readonly profileId: string;
    readonly role: "owner" | "viewer";
  }[]
) =>
  Schema.decodeEffect(PersonSchema)({
    email,
    memberships,
    personId,
  }).pipe(Effect.orElseSucceed(() => anonymousPerson));

const resolveOwnerPerson = (sqlite: SqliteClient["Service"]) =>
  Effect.gen(function* loadOwnerPerson() {
    const rows = yield* sqlite
      .query(
        "SELECT id, profile_id, email, role FROM members WHERE role = 'owner' ORDER BY created_at ASC, id ASC",
        [],
        MemberRowSchema
      )
      .pipe(Effect.orElseSucceed(() => []));

    const [primary] = rows;

    if (primary === undefined) {
      return anonymousPerson;
    }

    const memberships = [
      ...new Map(
        rows.map((row) => [
          row.profile_id,
          { profileId: row.profile_id, role: row.role },
        ])
      ).values(),
    ];

    return yield* decodePerson(primary.id, primary.email, memberships);
  });

const resolveBootstrapOwner = (
  sqlite: SqliteClient["Service"],
  person: Person
) =>
  Effect.gen(function* checkFreshInstallBootstrap() {
    if (person.memberships.length > 0) {
      return person;
    }

    const anyMember = yield* sqlite
      .query("SELECT id FROM members LIMIT 1", [], IdRowSchema)
      .pipe(Effect.orElseSucceed(() => []));

    if (anyMember.length > 0) {
      return person;
    }

    const profiles = yield* sqlite
      .query(
        "SELECT id FROM profiles WHERE archived_at IS NULL",
        [],
        IdRowSchema
      )
      .pipe(Effect.orElseSucceed(() => []));

    return yield* decodePerson(
      person.personId,
      person.email,
      profiles.map((profile) => ({
        profileId: profile.id,
        role: "owner" as const,
      }))
    );
  });

export const d1OwnerPersonLayer: Layer.Layer<
  CurrentPerson,
  never,
  SqliteClient
> = Layer.effect(
  CurrentPerson,
  Effect.gen(function* loadD1Owner() {
    const sqlite = yield* SqliteClient;

    return yield* resolveOwnerPerson(sqlite);
  })
);

export const pecuniaRpcLayer = (options?: D1ReportSourceOptions) =>
  Layer.mergeAll(rpcProjection.layer, RpcSerialization.layerJson).pipe(
    Layer.provide(
      Layer.mergeAll(pecuniaServicesLayer(options), d1OwnerPersonLayer)
    )
  );

interface AccessRejectedBody {
  readonly error: "Unauthenticated";
  readonly message: string;
  readonly reason: string;
}

const unauthenticatedResponse = (body: AccessRejectedBody) =>
  HttpServerResponse.json(body, { status: 401 }).pipe(Effect.orDie);

const buildSharedServicesLayer = (
  sqliteLayer: Layer.Layer<SqliteClient>,
  flagsLayer: Layer.Layer<Flags>,
  options?: PecuniaHandlerOptions
) => {
  const jwksLayer = JwksCache.layer.pipe(
    Layer.provide(options?.httpClientLayer ?? FetchHttpClient.layer)
  );

  return pecuniaServicesLayer(options).pipe(
    Layer.provideMerge(Layer.mergeAll(sqliteLayer, flagsLayer, jwksLayer))
  );
};

type SharedServices = Layer.Success<
  ReturnType<typeof buildSharedServicesLayer>
>;

const makeRpcHttpEffect = (
  baseContext: Context.Context<SharedServices>,
  options?: PecuniaHandlerOptions
) => {
  const accessSettings = Option.fromUndefinedOr(options?.access).pipe(
    Option.map((settings) => ({
      audience: settings.audience,
      teamDomain: normalizeTeamDomain(settings.teamDomain),
    }))
  );

  const baseLayer = Layer.succeedContext(baseContext);

  return Effect.gen(function* handleRpc() {
    const request = yield* HttpServerRequest.HttpServerRequest;

    const sqlite = Context.get(baseContext, SqliteClient);

    const surface = request.headers["x-pecunia-surface"];

    let person: Person;

    if (Option.isSome(accessSettings) && surface === "browser") {
      const token = extractAccessJwt(request);

      if (token === undefined) {
        return yield* unauthenticatedResponse({
          error: "Unauthenticated",
          message:
            "Cloudflare Zero Trust Access token (Cf-Access-Jwt-Assertion) is required.",
          reason: "missing",
        });
      }

      const verified = yield* verifyAccess(token, accessSettings.value).pipe(
        Effect.result
      );

      if (Result.isFailure(verified)) {
        return yield* unauthenticatedResponse({
          error: "Unauthenticated",
          message: verified.failure.message,
          reason: verified.failure.reason,
        });
      }

      if (Predicate.isTagged(verified.success, "Person")) {
        const resolved = yield* resolvePerson(verified.success).pipe(
          Effect.orElseSucceed(() => anonymousPerson)
        );

        person = yield* resolveBootstrapOwner(sqlite, resolved);
      } else {
        person = yield* resolveOwnerPerson(sqlite);
      }
    } else {
      person = yield* resolveOwnerPerson(sqlite);
    }

    const requestLayer = Layer.mergeAll(
      rpcProjection.layer,
      RpcSerialization.layerJson
    ).pipe(
      Layer.provide(
        Layer.mergeAll(baseLayer, Layer.succeed(CurrentPerson, person))
      )
    );

    const rpcHttpApp = yield* RpcServer.toHttpEffect(rpcProjection.group).pipe(
      Effect.provide(requestLayer)
    );

    return yield* rpcHttpApp;
  }).pipe(Effect.scoped, Effect.provide(baseLayer));
};

export const pecuniaRpcHttpEffect = (
  sqliteLayer: Layer.Layer<SqliteClient>,
  flagsLayer: Layer.Layer<Flags>,
  options?: PecuniaHandlerOptions
) =>
  Effect.map(
    Layer.build(buildSharedServicesLayer(sqliteLayer, flagsLayer, options)),
    (baseContext) => makeRpcHttpEffect(baseContext, options)
  );

export const pecuniaRpcWebHandler = (
  sqliteLayer: Layer.Layer<SqliteClient>,
  flagsLayer: Layer.Layer<Flags>,
  options?: PecuniaHandlerOptions
) =>
  HttpRouter.toWebHandler(
    Layer.unwrap(
      Effect.map(
        Layer.build(buildSharedServicesLayer(sqliteLayer, flagsLayer, options)),
        (baseContext) =>
          HttpRouter.add(
            "POST",
            "/rpc",
            makeRpcHttpEffect(baseContext, options)
          )
      )
    ),
    { disableLogger: true }
  );
