import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { SqliteClientError } from "@pecunia/database/sqlite-client";
import { Clock, DateTime, Effect, Layer, Random, Schema } from "effect";

import { BootstrapClosed } from "./bootstrap-closed.js";
import { DirectoryUnavailable } from "./directory-unavailable.js";
import { LastOwner } from "./last-owner.js";
import { MemberNotFound } from "./member-not-found.js";
import { MembershipDirectory } from "./membership.js";
import {
  EmailSchema,
  MemberIdSchema,
  ProfileIdSchema,
  RoleSchema,
} from "./model.js";
import type {
  Email,
  Member,
  MemberId,
  MemberInvite,
  MembershipGrant,
  ProfileId,
} from "./model.js";

const CountRowSchema = Schema.Struct({
  total: Schema.Int,
});

const MemberRowSchema = Schema.Struct({
  created_at: Schema.Int,
  email: EmailSchema,
  id: MemberIdSchema,
  profile_id: ProfileIdSchema,
  role: RoleSchema,
});

type MemberRow = typeof MemberRowSchema.Type;

const unavailable = (cause: SqliteClientError): DirectoryUnavailable =>
  new DirectoryUnavailable({ cause });

const dateOf = (millis: number): Date =>
  DateTime.toDate(DateTime.makeUnsafe(millis));

const toMember = (row: MemberRow): Member => ({
  createdAt: dateOf(row.created_at),
  email: row.email,
  id: row.id,
  profileId: row.profile_id,
  role: row.role,
});

const nextMemberId = (now: number) =>
  Effect.gen(function* generateMemberId() {
    const suffix = yield* Random.nextIntBetween(0, 268_435_456);

    return yield* Schema.decodeEffect(MemberIdSchema)(
      `member-${now.toString(36)}-${suffix.toString(16).padStart(8, "0")}`
    ).pipe(Effect.orDie);
  });

export const d1MembershipLayer: Layer.Layer<
  MembershipDirectory,
  never,
  SqliteClient
> = Layer.effect(
  MembershipDirectory,
  Effect.gen(function* makeD1MembershipDirectory() {
    const sqlite = yield* SqliteClient;

    const ownerCountOf = (profileId: ProfileId) =>
      sqlite
        .query(
          "SELECT COUNT(*) AS total FROM members WHERE profile_id = ? AND role = 'owner'",
          [profileId],
          CountRowSchema
        )
        .pipe(
          Effect.map((rows) => rows[0]?.total ?? 0),
          Effect.mapError(unavailable)
        );

    const countMembers = Effect.fn("D1MembershipDirectory.countMembers")(
      function* countMembers() {
        const rows = yield* sqlite
          .query("SELECT COUNT(*) AS total FROM members", [], CountRowSchema)
          .pipe(Effect.mapError(unavailable));

        return rows[0]?.total ?? 0;
      }
    );

    const findByEmail = Effect.fn("D1MembershipDirectory.findByEmail")(
      function* findByEmail(email: Email) {
        const rows = yield* sqlite
          .query(
            "SELECT id, profile_id, email, role, created_at FROM members WHERE email = ? ORDER BY created_at ASC, id ASC",
            [email],
            MemberRowSchema
          )
          .pipe(Effect.mapError(unavailable));

        return rows.map(toMember);
      }
    );

    const grant = Effect.fn("D1MembershipDirectory.grant")(function* grant(
      input: MembershipGrant
    ) {
      const existingRows = yield* sqlite
        .query(
          "SELECT id, profile_id, email, role, created_at FROM members WHERE profile_id = ? AND email = ? LIMIT 1",
          [input.profileId, input.email],
          MemberRowSchema
        )
        .pipe(Effect.mapError(unavailable));

      const [existing] = existingRows;

      if (existing !== undefined) {
        if (existing.role === "owner" && input.role !== "owner") {
          const owners = yield* ownerCountOf(existing.profile_id);

          if (owners <= 1) {
            return yield* new LastOwner({
              memberId: existing.id,
              profileId: existing.profile_id,
            });
          }
        }

        yield* sqlite
          .execute("UPDATE members SET role = ? WHERE id = ?", [
            input.role,
            existing.id,
          ])
          .pipe(Effect.mapError(unavailable));

        return toMember({ ...existing, role: input.role });
      }

      const now = yield* Clock.currentTimeMillis;
      const memberId = yield* nextMemberId(now);

      yield* sqlite
        .execute(
          "INSERT INTO members (id, profile_id, email, role, created_at) VALUES (?, ?, ?, ?, ?)",
          [memberId, input.profileId, input.email, input.role, now]
        )
        .pipe(Effect.mapError(unavailable));

      return {
        createdAt: dateOf(now),
        email: input.email,
        id: memberId,
        profileId: input.profileId,
        role: input.role,
      };
    });

    const insertFirstOwner = Effect.fn(
      "D1MembershipDirectory.insertFirstOwner"
    )(function* insertFirstOwner(invite: MemberInvite) {
      const total = yield* countMembers();

      if (total > 0) {
        return yield* new BootstrapClosed({
          message: "The first owner already exists, so bootstrap is closed",
          profileId: invite.profileId,
        });
      }

      const now = yield* Clock.currentTimeMillis;
      const memberId = yield* nextMemberId(now);

      yield* sqlite
        .execute(
          "INSERT INTO members (id, profile_id, email, role, created_at) VALUES (?, ?, ?, 'owner', ?)",
          [memberId, invite.profileId, invite.email, now]
        )
        .pipe(Effect.mapError(unavailable));

      return {
        createdAt: dateOf(now),
        email: invite.email,
        id: memberId,
        profileId: invite.profileId,
        role: "owner" as const,
      };
    });

    const revoke = Effect.fn("D1MembershipDirectory.revoke")(function* revoke(
      memberId: MemberId
    ) {
      const rows = yield* sqlite
        .query(
          "SELECT id, profile_id, email, role, created_at FROM members WHERE id = ? LIMIT 1",
          [memberId],
          MemberRowSchema
        )
        .pipe(Effect.mapError(unavailable));

      const [target] = rows;

      if (target === undefined) {
        return yield* new MemberNotFound({ memberId });
      }

      if (target.role === "owner") {
        const owners = yield* ownerCountOf(target.profile_id);

        if (owners <= 1) {
          return yield* new LastOwner({
            memberId,
            profileId: target.profile_id,
          });
        }
      }

      yield* sqlite
        .execute("DELETE FROM members WHERE id = ?", [memberId])
        .pipe(Effect.mapError(unavailable));

      return memberId;
    });

    return { countMembers, findByEmail, grant, insertFirstOwner, revoke };
  })
);
