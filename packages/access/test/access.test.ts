import { describe, expect, it } from "@effect/vitest";
import { Clock, Effect, Layer, Predicate, Ref, Schema } from "effect";
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
  MemberIdSchema,
  MembershipDirectory,
  memoryMembershipLayer,
  resolvePerson,
  RoleSchema,
  Unauthenticated,
  verifyAccess,
} from "../src/index.js";
import type { JsonWebKey, JwksCache } from "../src/index.js";
import {
  accessLayer,
  accessLayerFor,
  accessSettings,
  AUDIENCE,
  DEMO_PROFILE,
  headerFor,
  KID,
  makeSigningKey,
  memberEmail,
  mixedClaims,
  otherAccessSettings,
  OTHER_ISSUER,
  OTHER_PROFILE,
  OTHER_TEAM_DOMAIN,
  personClaims,
  personWith,
  profileId,
  serviceTokenClaims,
  signToken,
  TEAM_DOMAIN,
  tokenWith,
  unidentifiedClaims,
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

    return failure;
  });

const withDirectory = <A, E>(
  use: (
    directory: MembershipDirectory["Service"]
  ) => Effect.Effect<A, E, MembershipDirectory>
) =>
  Effect.gen(function* runWithDirectory() {
    const directory = yield* MembershipDirectory;

    return yield* use(directory);
  }).pipe(Effect.provide(memoryMembershipLayer));

const MEMBER_EMAILS = [
  "first@example.com",
  "second@example.com",
  "third@example.com",
] as const;

const ownersOf = (directory: MembershipDirectory["Service"], profile: string) =>
  Effect.gen(function* countOwners() {
    const lists = yield* Effect.all(
      MEMBER_EMAILS.map((email) => directory.findByEmail(memberEmail(email)))
    );

    return lists
      .flat()
      .filter(
        (member) => member.profileId === profile && member.role === "owner"
      ).length;
  });

const MembershipStep = Schema.TaggedUnion({
  Grant: {
    email: Schema.Literals(MEMBER_EMAILS),
    profileId: Schema.Literals([DEMO_PROFILE, OTHER_PROFILE]),
    role: RoleSchema,
  },
  Revoke: {
    memberId: Schema.Literals(["member-1", "member-2", "member-3"]),
  },
});

const membershipSteps = Arbitrary.array(Arbitrary.schema(MembershipStep), {
  maxLength: 8,
});

const applyStep = (
  directory: MembershipDirectory["Service"],
  step: typeof MembershipStep.Type
) =>
  Predicate.isTagged(step, "Grant")
    ? directory.grant({
        email: memberEmail(step.email),
        profileId: profileId(step.profileId),
        role: step.role,
      })
    : directory.revoke(Schema.decodeSync(MemberIdSchema)(step.memberId));

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

        const failure = yield* expectUnauthenticated(token);

        expect(failure.reason).toBe("notYetValid");
      })
    )
  );

  it.effect("a person token with no nbf passes", () =>
    withAccess((context) =>
      Effect.gen(function* noNotBefore() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          personClaims(now)
        );

        const claims = yield* verifiedPerson(token);

        expect(claims.notBefore).toBeUndefined();
      })
    )
  );

  it.effect("a service token carries no nbf and still passes", () =>
    withAccess((context) =>
      Effect.gen(function* serviceTokenWithoutNotBefore() {
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

        expect(claims.clientId).toBe("demo-sync-worker");
        expect(claims.notBefore).toBeUndefined();

        return claims;
      })
    )
  );

  it.effect("a token naming neither an email nor a service token fails", () =>
    withAccess((context) =>
      Effect.gen(function* unidentified() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          unidentifiedClaims(now)
        );

        const failure = yield* expectUnauthenticated(token);

        expect(failure.reason).toBe("claims");
      })
    )
  );

  it.effect(
    "a token carrying both an email and a common name is a person",
    () =>
      withAccess((context) =>
        Effect.gen(function* emailAndCommonName() {
          const now = yield* Clock.currentTimeMillis;

          const token = yield* signToken(
            context.signer,
            headerFor(KID),
            mixedClaims(now)
          );

          const claims = yield* verifiedPerson(token);

          expect(claims.email).toBe("owner@example.com");
          expect(claims.personId).toBe("person-1");
        })
      )
  );

  it.effect("a token longer than 8192 characters fails before decoding", () =>
    withAccess((context) =>
      Effect.gen(function* oversizedToken() {
        const now = yield* Clock.currentTimeMillis;

        const token = yield* signToken(
          context.signer,
          headerFor(KID),
          personClaims(now, { notBeforeSeconds: 0, padding: 9000 })
        );

        expect(token.length).toBeGreaterThan(8192);

        const failure = yield* expectUnauthenticated(token);

        expect(failure.reason).toBe("malformed");
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
            issuer: `https://${OTHER_TEAM_DOMAIN}`,
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

        const failure = yield* expectUnauthenticated(token);

        expect(failure.reason).toBe("key");
        expect(failure.message).not.toContain("retired-signing-key");
      })
    )
  );

  it.effect("a token naming RS384 or PS256 fails on the algorithm", () =>
    withAccess((context) =>
      Effect.gen(function* algorithmPin() {
        const now = yield* Clock.currentTimeMillis;

        const rs384 = yield* makeSigningKey(KID, "RS384");

        yield* Ref.set(context.keys, [rs384.jwk]);

        const rs384Token = yield* signToken(
          rs384,
          headerFor(KID, "RS384"),
          personClaims(now)
        );

        const rs384Failure = yield* expectUnauthenticated(rs384Token);

        expect(rs384Failure.reason).toBe("algorithm");

        const ps256 = yield* makeSigningKey(KID, "PS256");

        yield* Ref.set(context.keys, [ps256.jwk]);

        const ps256Token = yield* signToken(
          ps256,
          headerFor(KID, "PS256"),
          personClaims(now)
        );

        const ps256Failure = yield* expectUnauthenticated(ps256Token);

        expect(ps256Failure.reason).toBe("algorithm");
      })
    )
  );

  it.effect("two Access teams never share cached signing keys", () =>
    Effect.gen(function* teamKeyIsolation() {
      const now = yield* Clock.currentTimeMillis;
      const homeTeam = yield* makeSigningKey(KID);
      const otherTeam = yield* makeSigningKey(KID);
      const fetches = yield* Ref.make(0);

      const keySets = new Map<string, readonly JsonWebKey[]>([
        [`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`, [homeTeam.jwk]],
        [`https://${OTHER_TEAM_DOMAIN}/cdn-cgi/access/certs`, [otherTeam.jwk]],
      ]);

      const layer = accessLayerFor((url) => {
        const keys = keySets.get(url);

        return keys === undefined
          ? Effect.die(new Error("Unexpected Access key set URL"))
          : Effect.succeed(keys);
      }, fetches);

      yield* Effect.gen(function* verifyBothTeams() {
        const homeToken = yield* signToken(
          homeTeam,
          headerFor(KID),
          personClaims(now)
        );

        const home = yield* verifyAccess(homeToken, accessSettings);

        expect(home.issuer).toBe(`https://${TEAM_DOMAIN}`);

        const otherToken = yield* signToken(
          otherTeam,
          headerFor(KID),
          personClaims(now, { issuer: OTHER_ISSUER })
        );

        const other = yield* verifyAccess(otherToken, otherAccessSettings);

        expect(other.issuer).toBe(OTHER_ISSUER);
      }).pipe(Effect.provide(layer));

      expect(yield* Ref.get(fetches)).toBe(2);
    })
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

  it.effect("the only owner cannot be demoted to viewer", () =>
    withDirectory((directory) =>
      Effect.gen(function* demoteLastOwner() {
        const owner = yield* bootstrap({
          email: memberEmail("first@example.com"),
          profileId: profileId(DEMO_PROFILE),
        });

        const failure = yield* Effect.flip(
          directory.grant({
            email: owner.email,
            profileId: owner.profileId,
            role: "viewer",
          })
        );

        expect(failure).toBeInstanceOf(LastOwner);
        expect(yield* ownersOf(directory, DEMO_PROFILE)).toBe(1);

        const closed = yield* Effect.flip(
          bootstrap({
            email: memberEmail("second@example.com"),
            profileId: profileId(DEMO_PROFILE),
          })
        );

        expect(closed).toBeInstanceOf(BootstrapClosed);
      })
    )
  );

  it.effect("granting the same email twice replaces the role", () =>
    withDirectory((directory) =>
      Effect.gen(function* grantTwice() {
        yield* bootstrap({
          email: memberEmail("first@example.com"),
          profileId: profileId(DEMO_PROFILE),
        });

        const invite = {
          email: memberEmail("second@example.com"),
          profileId: profileId(DEMO_PROFILE),
        } as const;

        yield* directory.grant({ ...invite, role: "viewer" });
        yield* directory.grant({ ...invite, role: "owner" });

        const members = yield* directory.findByEmail(invite.email);

        expect(members).toHaveLength(1);
        expect(members.map((member) => member.role)).toStrictEqual(["owner"]);
        expect(yield* directory.countMembers()).toBe(2);
      })
    )
  );

  it.effect.prop(
    "a bootstrapped profile keeps an owner and stays closed through any grant and revoke sequence",
    { steps: membershipSteps },
    ({ steps }) =>
      withDirectory((directory) =>
        Effect.gen(function* ownerInvariant() {
          yield* bootstrap({
            email: memberEmail("first@example.com"),
            profileId: profileId(DEMO_PROFILE),
          });

          for (const step of steps) {
            yield* applyStep(directory, step).pipe(Effect.ignore);

            expect(
              yield* ownersOf(directory, DEMO_PROFILE)
            ).toBeGreaterThanOrEqual(1);
          }

          const closed = yield* Effect.flip(
            bootstrap({
              email: memberEmail("stranger@example.com"),
              profileId: profileId(DEMO_PROFILE),
            })
          );

          expect(closed).toBeInstanceOf(BootstrapClosed);
        })
      )
  );

  it.effect(
    "a repeated directory row never gives a person two memberships",
    () =>
      withAccess((context) =>
        Effect.gen(function* repeatedRows() {
          const claims = yield* verifiedPersonToken(context.signer);

          yield* bootstrap({
            email: claims.email,
            profileId: profileId(DEMO_PROFILE),
          });

          const directory = yield* MembershipDirectory;

          const repeating = Layer.succeed(MembershipDirectory, {
            ...directory,
            findByEmail: (email) =>
              directory
                .findByEmail(email)
                .pipe(Effect.map((members) => [...members, ...members])),
          });

          const person = yield* resolvePerson(claims).pipe(
            Effect.provide(repeating)
          );

          expect(person.memberships).toStrictEqual([
            { profileId: DEMO_PROFILE, role: "owner" },
          ]);
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
