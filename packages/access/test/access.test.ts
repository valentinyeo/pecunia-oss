import { describe, expect, it } from "@effect/vitest";
import { Clock, Effect, Predicate, Ref, Schema } from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { TestClock } from "effect/testing";

import { testPersonLayer } from "../src/devtools.js";
import {
  authorize,
  authorizeServiceCall,
  bootstrap,
  BootstrapClosed,
  ContractNameSchema,
  CurrentPerson,
  Forbidden,
  LastOwner,
  MembershipDirectory,
  resolvePerson,
  Unauthenticated,
  verifyAccess,
} from "../src/index.js";
import type { JsonWebKey, JwksCache } from "../src/index.js";
import {
  accessLayer,
  accessSettings,
  AUDIENCE,
  DEMO_PROFILE,
  headerFor,
  KID,
  makeSigningKey,
  memberEmail,
  personClaims,
  personWith,
  profileId,
  serviceTokenClaims,
  signToken,
  tokenWith,
} from "./access-fixture.js";
import type { SigningKey } from "./access-fixture.js";

interface AccessContext {
  readonly fetches: Ref.Ref<number>;
  readonly keys: Ref.Ref<readonly JsonWebKey[]>;
  readonly layer: ReturnType<typeof accessLayer>;
  readonly signer: SigningKey;
}

const makeAccess = Effect.gen(function* makeAccess() {
  const signer = yield* makeSigningKey(KID);
  const keys = yield* Ref.make<readonly JsonWebKey[]>([signer.jwk]);
  const fetches = yield* Ref.make(0);

  return { fetches, keys, layer: accessLayer(keys, fetches), signer };
});

const withAccess = <A, E>(
  use: (
    context: AccessContext
  ) => Effect.Effect<A, E, JwksCache | MembershipDirectory>
) =>
  Effect.gen(function* runWithAccess() {
    const context = yield* makeAccess;

    return yield* use(context).pipe(Effect.provide(context.layer));
  });

const verifiedPerson = (token: string) =>
  Effect.gen(function* verifyPersonToken() {
    const claims = yield* verifyAccess(token, accessSettings);

    if (!Predicate.isTagged(claims, "Person")) {
      return yield* Effect.die(new Error("Expected a person token"));
    }

    return claims;
  });

const verifiedPersonToken = (signer: SigningKey) =>
  Effect.gen(function* signPersonToken() {
    const now = yield* Clock.currentTimeMillis;
    const token = yield* signToken(signer, headerFor(KID), personClaims(now));

    return yield* verifiedPerson(token);
  });

const expectUnauthenticated = (token: string) =>
  Effect.gen(function* verifyFailsAsUnauthenticated() {
    const failure = yield* Effect.flip(verifyAccess(token, accessSettings));

    expect(failure).toBeInstanceOf(Unauthenticated);
  });

const contractName = (value: string) =>
  Schema.decodeSync(ContractNameSchema)(value);

describe("verifyAccess", () => {
  it.effect("a token signed by the team key passes", () =>
    withAccess((context) =>
      Effect.gen(function* validToken() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          personClaims(now)
        );

        const claims = yield* verifiedPerson(token);

        expect(claims.email).toBe("owner@example.com");
        expect(claims.personId).toBe("person-1");
        expect(claims.issuer).toBe(`https://${accessSettings.teamDomain}`);
        expect(claims.audience).toStrictEqual([AUDIENCE]);
      })
    )
  );

  it.effect("a forged signature fails", () =>
    withAccess(() =>
      Effect.gen(function* forgedSignature() {
        const now = yield* Clock.currentTimeMillis;
        const forger = yield* makeSigningKey(KID);

        const token = yield* signToken(
          forger,
          headerFor(KID),
          personClaims(now)
        );

        yield* expectUnauthenticated(token);
      })
    )
  );

  it.effect("an expired token fails", () =>
    withAccess((context) =>
      Effect.gen(function* expiredToken() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          personClaims(now, { expiresInSeconds: -120 })
        );

        yield* expectUnauthenticated(token);
      })
    )
  );

  it.effect("a token that is not valid yet fails", () =>
    withAccess((context) =>
      Effect.gen(function* notYetValid() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          personClaims(now, { notBeforeSeconds: 120 })
        );

        yield* expectUnauthenticated(token);
      })
    )
  );

  it.effect("a token for another Access application fails", () =>
    withAccess((context) =>
      Effect.gen(function* wrongAudience() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          personClaims(now, { audience: "another-access-application" })
        );

        yield* expectUnauthenticated(token);
      })
    )
  );

  it.effect("a token issued by another team fails", () =>
    withAccess((context) =>
      Effect.gen(function* wrongIssuer() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          personClaims(now, {
            issuer: "https://other-team.cloudflareaccess.com",
          })
        );

        yield* expectUnauthenticated(token);
      })
    )
  );

  it.effect("an unsigned alg none token fails", () =>
    withAccess(() =>
      Effect.gen(function* algNone() {
        const now = yield* Clock.currentTimeMillis;
        const token = tokenWith(headerFor(KID, "none"), personClaims(now), "");

        yield* expectUnauthenticated(token);
      })
    )
  );

  it.effect("an HS256 token fails", () =>
    withAccess(() =>
      Effect.gen(function* algHs256() {
        const now = yield* Clock.currentTimeMillis;

        const token = tokenWith(
          headerFor(KID, "HS256"),
          personClaims(now),
          "c2lnbmF0dXJl"
        );

        yield* expectUnauthenticated(token);
      })
    )
  );

  it.effect("a token naming an unknown signing key fails", () =>
    withAccess((context) =>
      Effect.gen(function* unknownKid() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor("retired-signing-key"),
          personClaims(now)
        );

        yield* expectUnauthenticated(token);
      })
    )
  );

  it.effect("the team key set is cached for an hour", () =>
    withAccess((context) =>
      Effect.gen(function* cachedKeySet() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          personClaims(now, { expiresInSeconds: 3600 })
        );

        yield* verifiedPerson(token);
        yield* TestClock.adjust("59 minutes");
        yield* verifiedPerson(token);

        expect(yield* Ref.get(context.fetches)).toBe(1);
      })
    )
  );

  it.effect("a rotated key is picked up by one refresh after a minute", () =>
    withAccess((context) =>
      Effect.gen(function* rotatedKey() {
        const now = yield* Clock.currentTimeMillis;
        const replacement = yield* makeSigningKey(KID);

        const token = yield* signToken(
          replacement,
          headerFor(KID),
          personClaims(now)
        );

        yield* expectUnauthenticated(token);

        yield* Ref.set(context.keys, [replacement.jwk]);

        yield* expectUnauthenticated(token);
        expect(yield* Ref.get(context.fetches)).toBe(1);

        yield* TestClock.adjust("61 seconds");
        yield* verifiedPerson(token);

        expect(yield* Ref.get(context.fetches)).toBe(2);
      })
    )
  );
});

describe("membership", () => {
  it.effect(
    "the first verified email becomes owner and the second bootstrap fails",
    () =>
      withAccess((context) =>
        Effect.gen(function* firstOwner() {
          const directory = yield* MembershipDirectory;
          const claims = yield* verifiedPersonToken(context.signer);

          const first = yield* bootstrap({
            email: claims.email,
            profileId: profileId(DEMO_PROFILE),
          });

          expect(first.role).toBe("owner");
          expect(yield* directory.countMembers()).toBe(1);

          const failure = yield* Effect.flip(
            bootstrap({
              email: memberEmail("second@example.com"),
              profileId: profileId(DEMO_PROFILE),
            })
          );

          expect(failure).toBeInstanceOf(BootstrapClosed);
          expect(yield* directory.countMembers()).toBe(1);

          const person = yield* resolvePerson(claims);

          expect(person.memberships).toStrictEqual([
            { profileId: DEMO_PROFILE, role: "owner" },
          ]);
        })
      )
  );

  it.effect("the last owner of a profile cannot be revoked", () =>
    withAccess(() =>
      Effect.gen(function* lastOwner() {
        const directory = yield* MembershipDirectory;

        const owner = yield* bootstrap({
          email: memberEmail("owner@example.com"),
          profileId: profileId(DEMO_PROFILE),
        });

        const failure = yield* Effect.flip(directory.revoke(owner.id));

        expect(failure).toBeInstanceOf(LastOwner);

        yield* directory.grant({
          email: memberEmail("second@example.com"),
          profileId: profileId(DEMO_PROFILE),
          role: "owner",
        });
        yield* directory.revoke(owner.id);

        expect(yield* directory.countMembers()).toBe(1);
      })
    )
  );
});

describe("authorize", () => {
  it.effect("a viewer reads but cannot write", () =>
    Effect.gen(function* viewerCannotWrite() {
      const person = personWith("viewer@example.com", [
        { profileId: DEMO_PROFILE, role: "viewer" },
      ]);

      const home = profileId(DEMO_PROFILE);

      yield* authorize(person, home, "read");

      const failure = yield* Effect.flip(authorize(person, home, "write"));

      expect(failure).toBeInstanceOf(Forbidden);
    })
  );

  it.effect("an owner writes", () =>
    Effect.gen(function* ownerWrites() {
      const person = personWith("owner@example.com", [
        { profileId: DEMO_PROFILE, role: "owner" },
      ]);

      yield* authorize(person, profileId(DEMO_PROFILE), "write");
    })
  );

  it.effect.prop(
    "a member of one profile is Forbidden on another",
    { name: Arbitrary.schema(Schema.NonEmptyString) },
    ({ name }) =>
      Effect.gen(function* otherProfile() {
        const person = personWith("owner@example.com", [
          { profileId: DEMO_PROFILE, role: "owner" },
        ]);

        const away = profileId(`${DEMO_PROFILE}-${name}`);

        const failure = yield* Effect.flip(authorize(person, away, "read"));

        expect(failure).toBeInstanceOf(Forbidden);
      })
  );

  it.effect("a service token calls only the contracts on its allowlist", () =>
    withAccess((context) =>
      Effect.gen(function* serviceAllowlist() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          serviceTokenClaims(now)
        );

        const claims = yield* verifyAccess(token, accessSettings);

        if (!Predicate.isTagged(claims, "ServiceToken")) {
          return yield* Effect.die(new Error("Expected a service token"));
        }

        const allowlist = [contractName("sync_accounts")];

        yield* authorizeServiceCall(
          claims,
          contractName("sync_accounts"),
          allowlist
        );

        const failure = yield* Effect.flip(
          authorizeServiceCall(claims, contractName("purge_profile"), allowlist)
        );

        expect(failure).toBeInstanceOf(Forbidden);

        return failure;
      })
    )
  );
});

describe("devtools", () => {
  it.effect("the test person layer provides the current person", () =>
    Effect.gen(function* testPerson() {
      const person = personWith("owner@example.com", [
        { profileId: DEMO_PROFILE, role: "owner" },
      ]);

      const current = yield* CurrentPerson.pipe(
        Effect.provide(testPersonLayer(person))
      );

      expect(current).toStrictEqual(person);
    })
  );
});
