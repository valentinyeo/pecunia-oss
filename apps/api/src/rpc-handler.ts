import { CurrentPerson, PersonSchema } from "@pecunia/access";
import { toRpc } from "@pecunia/capability/rpc";
import type { Flags } from "@pecunia/core/flags";
import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { D1ReportSourceOptions } from "@pecunia/reporting/d1";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";

import {
  pecuniaRpcCapabilities,
  pecuniaServicesLayer,
} from "./capabilities.js";

export const rpcProjection = toRpc(pecuniaRpcCapabilities);

const OwnerMemberRowSchema = Schema.Struct({
  email: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  profile_id: Schema.NonEmptyString,
  role: Schema.Literals(["owner", "viewer"]),
});

const anonymousPerson = Schema.decodeSync(PersonSchema)({
  email: "anonymous@example.invalid",
  memberships: [],
  personId: "person-anonymous",
});

export const d1OwnerPersonLayer: Layer.Layer<
  CurrentPerson,
  never,
  SqliteClient
> = Layer.effect(
  CurrentPerson,
  Effect.gen(function* resolveOwnerFromD1() {
    const sqlite = yield* SqliteClient;

    const rows = yield* sqlite
      .query(
        "SELECT id, profile_id, email, role FROM members WHERE role = 'owner' ORDER BY created_at ASC, id ASC",
        [],
        OwnerMemberRowSchema
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

    return yield* Schema.decodeEffect(PersonSchema)({
      email: primary.email,
      memberships,
      personId: primary.id,
    }).pipe(Effect.orElseSucceed(() => anonymousPerson));
  })
);

export const pecuniaRpcLayer = (options?: D1ReportSourceOptions) =>
  Layer.mergeAll(rpcProjection.layer, RpcSerialization.layerJson).pipe(
    Layer.provide(
      Layer.mergeAll(pecuniaServicesLayer(options), d1OwnerPersonLayer)
    )
  );

export const pecuniaRpcHttpEffect = (
  sqliteLayer: Layer.Layer<SqliteClient>,
  flagsLayer: Layer.Layer<Flags>,
  options?: D1ReportSourceOptions
) =>
  RpcServer.toHttpEffect(rpcProjection.group).pipe(
    Effect.provide(
      pecuniaRpcLayer(options).pipe(
        Layer.provide(Layer.mergeAll(sqliteLayer, flagsLayer))
      )
    )
  );

export const pecuniaRpcWebHandler = (
  sqliteLayer: Layer.Layer<SqliteClient>,
  flagsLayer: Layer.Layer<Flags>,
  options?: D1ReportSourceOptions
) =>
  HttpRouter.toWebHandler(
    RpcServer.layerHttp({
      group: rpcProjection.group,
      path: "/rpc",
      protocol: "http",
    }).pipe(
      Layer.provide(
        pecuniaRpcLayer(options).pipe(
          Layer.provide(Layer.mergeAll(sqliteLayer, flagsLayer))
        )
      )
    ),
    { disableLogger: true }
  );
