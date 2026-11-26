import { describe, expect, it } from "@effect/vitest";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { Effect, Layer, Schema } from "effect";

import { d1MembershipLayer } from "../src/d1.js";
import { MembershipDirectory } from "../src/membership.js";
import { EmailSchema, ProfileIdSchema } from "../src/model.js";

const demoDirectoryLayer = () =>
  d1MembershipLayer.pipe(Layer.provide(openDemoSqliteLayer()));

describe("d1MembershipLayer against migrated demo D1 schema", () => {
  it.effect(
    "finds seeded members, protects the last owner, and persists grants and revocations",
    () =>
      Effect.gen(function* testMembershipD1() {
        const directory = yield* MembershipDirectory;

        const ownerEmail =
          yield* Schema.decodeEffect(EmailSchema)("demo@example.com");

        const newEmail = yield* Schema.decodeEffect(EmailSchema)(
          "auditor@example.com"
        );

        const profileId = yield* Schema.decodeEffect(ProfileIdSchema)(
          "0192f0c1-0001-702d-8484-48490b729601"
        );

        const initial = yield* directory.findByEmail(ownerEmail);

        expect(initial).toHaveLength(1);
        expect(initial[0]?.role).toBe("owner");

        const demoteError = yield* directory
          .grant({ email: ownerEmail, profileId, role: "viewer" })
          .pipe(Effect.flip);

        expect(demoteError._tag).toBe("LastOwner");

        const granted = yield* directory.grant({
          email: newEmail,
          profileId,
          role: "viewer",
        });

        expect(granted.role).toBe("viewer");

        const found = yield* directory.findByEmail(newEmail);

        expect(found).toHaveLength(1);

        const revokedId = yield* directory.revoke(granted.id);

        expect(revokedId).toBe(granted.id);

        const afterRevoke = yield* directory.findByEmail(newEmail);

        expect(afterRevoke).toHaveLength(0);
      }).pipe(Effect.provide(demoDirectoryLayer()))
  );
});
