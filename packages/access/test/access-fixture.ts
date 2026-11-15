// @effect-diagnostics-next-line nodeBuiltinImport:off -- The runtime uses the global Web Crypto API; this import only names its key type.
import type { webcrypto } from "node:crypto";

import { Effect, Layer, Ref, Schema } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import {
  EmailSchema,
  JwksCache,
  JsonWebKeySchema,
  memoryMembershipLayer,
  PersonSchema,
  ProfileIdSchema,
} from "../src/index.js";
import type { JsonWebKey } from "../src/index.js";

export const TEAM_DOMAIN = "example-team.cloudflareaccess.com";

export const AUDIENCE = "demo-access-application";

export const ISSUER = `https://${TEAM_DOMAIN}`;

export const KID = "demo-signing-key";

export const DEMO_PROFILE = "profile-demo";

export const accessSettings = {
  audience: AUDIENCE,
  teamDomain: TEAM_DOMAIN,
} as const;

export const profileId = (value: string) =>
  Schema.decodeSync(ProfileIdSchema)(value);

export const personWith = (
  email: string,
  memberships: readonly {
    readonly profileId: string;
    readonly role: "owner" | "viewer";
  }[]
) =>
  Schema.decodeSync(PersonSchema)({
    email,
    memberships,
    personId: "person-1",
  });

export const memberEmail = (value: string) =>
  Schema.decodeSync(EmailSchema)(value);

export interface SigningKey {
  readonly jwk: JsonWebKey;
  readonly privateKey: webcrypto.CryptoKey;
}

export const makeSigningKey = (kid: string) =>
  Effect.gen(function* generateSigningKey() {
    const pair = yield* Effect.promise(() =>
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

    const exported = yield* Effect.promise(() =>
      crypto.subtle.exportKey("jwk", pair.publicKey)
    );

    const jwk = yield* Schema.decodeEffect(JsonWebKeySchema)({
      alg: "RS256",
      e: exported.e ?? "",
      kid,
      kty: "RSA",
      n: exported.n ?? "",
      use: "sig",
    }).pipe(Effect.orDie);

    return { jwk, privateKey: pair.privateKey };
  });

const encodeSegment = (json: string): string =>
  btoa(json).replaceAll("+", "-").replaceAll("/", "_").replace(/[=]+$/u, "");

const encodeBytes = (bytes: Uint8Array): string => {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");
};

export const headerFor = (kid: string, alg = "RS256"): string =>
  JSON.stringify({ alg, kid, typ: "JWT" });

export interface TokenOptions {
  readonly audience?: string;
  readonly expiresInSeconds?: number;
  readonly issuer?: string;
  readonly notBeforeSeconds?: number;
}

export const personClaims = (now: number, options: TokenOptions = {}) => {
  const issued = Math.floor(now / 1000);

  return JSON.stringify({
    aud: [options.audience ?? AUDIENCE],
    email: "owner@example.com",
    exp: issued + (options.expiresInSeconds ?? 300),
    iat: issued,
    iss: options.issuer ?? ISSUER,
    nbf: issued + (options.notBeforeSeconds ?? 0),
    sub: "person-1",
  });
};

export const serviceTokenClaims = (now: number, options: TokenOptions = {}) => {
  const issued = Math.floor(now / 1000);

  return JSON.stringify({
    aud: [options.audience ?? AUDIENCE],
    common_name: "demo-sync-worker",
    exp: issued + (options.expiresInSeconds ?? 300),
    iat: issued,
    iss: options.issuer ?? ISSUER,
    nbf: issued + (options.notBeforeSeconds ?? 0),
    sub: "",
  });
};

export const tokenWith = (
  headerJson: string,
  claimsJson: string,
  signature: string
): string =>
  `${encodeSegment(headerJson)}.${encodeSegment(claimsJson)}.${signature}`;

export const signToken = (
  key: SigningKey,
  headerJson: string,
  claimsJson: string
) =>
  Effect.gen(function* sign() {
    const signingInput = `${encodeSegment(headerJson)}.${encodeSegment(claimsJson)}`;

    const signature = yield* Effect.promise(() =>
      crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key.privateKey,
        new TextEncoder().encode(signingInput)
      )
    );

    return `${signingInput}.${encodeBytes(new Uint8Array(signature))}`;
  });

export const accessLayer = (
  keys: Ref.Ref<readonly JsonWebKey[]>,
  fetches: Ref.Ref<number>
) =>
  Layer.mergeAll(JwksCache.layer, memoryMembershipLayer).pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.gen(function* serveKeySet() {
            yield* Ref.update(fetches, (count) => count + 1);

            const keySet = yield* Ref.get(keys);

            return HttpClientResponse.fromWeb(
              request,
              Response.json({ keys: keySet })
            );
          })
        )
      )
    )
  );
