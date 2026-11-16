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

export const OTHER_TEAM_DOMAIN = "other-team.cloudflareaccess.com";

export const AUDIENCE = "demo-access-application";

export const ISSUER = `https://${TEAM_DOMAIN}`;

export const OTHER_ISSUER = `https://${OTHER_TEAM_DOMAIN}`;

export const KID = "demo-signing-key";

export const DEMO_PROFILE = "profile-demo";

export const OTHER_PROFILE = "profile-other";

export const accessSettings = {
  audience: AUDIENCE,
  teamDomain: TEAM_DOMAIN,
} as const;

export const otherAccessSettings = {
  audience: AUDIENCE,
  teamDomain: OTHER_TEAM_DOMAIN,
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

export type SigningAlgorithm = "PS256" | "RS256" | "RS384";

export interface SigningKey {
  readonly algorithm: SigningAlgorithm;
  readonly jwk: JsonWebKey;
  readonly privateKey: webcrypto.CryptoKey;
}

const keyParameters = (
  algorithm: SigningAlgorithm
): webcrypto.RsaHashedKeyGenParams => ({
  hash: algorithm === "RS384" ? "SHA-384" : "SHA-256",
  modulusLength: 2048,
  name: algorithm === "PS256" ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
  publicExponent: new Uint8Array([1, 0, 1]),
});

const signParameters = (
  algorithm: SigningAlgorithm
): webcrypto.AlgorithmIdentifier | webcrypto.RsaPssParams =>
  algorithm === "PS256"
    ? { name: "RSA-PSS", saltLength: 32 }
    : { name: "RSASSA-PKCS1-v1_5" };

export const makeSigningKey = (
  kid: string,
  algorithm: SigningAlgorithm = "RS256"
) =>
  Effect.gen(function* generateSigningKey() {
    const pair = yield* Effect.promise(() =>
      crypto.subtle.generateKey(keyParameters(algorithm), true, [
        "sign",
        "verify",
      ])
    );

    const exported = yield* Effect.promise(() =>
      crypto.subtle.exportKey("jwk", pair.publicKey)
    );

    const jwk = yield* Schema.decodeEffect(JsonWebKeySchema)({
      alg: algorithm,
      e: exported.e ?? "",
      kid,
      kty: "RSA",
      n: exported.n ?? "",
      use: "sig",
    }).pipe(Effect.orDie);

    return { algorithm, jwk, privateKey: pair.privateKey };
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
  readonly padding?: number;
}

const registeredClaims = (now: number, options: TokenOptions) => {
  const issued = Math.floor(now / 1000);

  const claims = {
    aud: [options.audience ?? AUDIENCE],
    exp: issued + (options.expiresInSeconds ?? 300),
    iat: issued,
    iss: options.issuer ?? ISSUER,
  };

  const timed =
    options.notBeforeSeconds === undefined
      ? claims
      : { ...claims, nbf: issued + options.notBeforeSeconds };

  return options.padding === undefined
    ? timed
    : { ...timed, pad: "x".repeat(options.padding) };
};

export const personClaims = (now: number, options: TokenOptions = {}) =>
  JSON.stringify({
    ...registeredClaims(now, options),
    email: "owner@example.com",
    sub: "person-1",
  });

export const serviceTokenClaims = (now: number, options: TokenOptions = {}) =>
  JSON.stringify({
    ...registeredClaims(now, options),
    common_name: "demo-sync-worker",
    sub: "",
  });

export const mixedClaims = (now: number, options: TokenOptions = {}) =>
  JSON.stringify({
    ...registeredClaims(now, options),
    common_name: "demo-sync-worker",
    email: "owner@example.com",
    sub: "person-1",
  });

export const unidentifiedClaims = (now: number, options: TokenOptions = {}) =>
  JSON.stringify(registeredClaims(now, options));

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
        signParameters(key.algorithm),
        key.privateKey,
        new TextEncoder().encode(signingInput)
      )
    );

    return `${signingInput}.${encodeBytes(new Uint8Array(signature))}`;
  });

export const accessLayerFor = (
  keysFor: (url: string) => Effect.Effect<readonly JsonWebKey[]>,
  fetches: Ref.Ref<number>
) =>
  Layer.mergeAll(JwksCache.layer, memoryMembershipLayer).pipe(
    Layer.provide(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.gen(function* serveKeySet() {
            yield* Ref.update(fetches, (count) => count + 1);

            const keySet = yield* keysFor(request.url);

            return HttpClientResponse.fromWeb(
              request,
              Response.json({ keys: keySet })
            );
          })
        )
      )
    )
  );

export const accessLayer = (
  keys: Ref.Ref<readonly JsonWebKey[]>,
  fetches: Ref.Ref<number>
) => accessLayerFor(() => Ref.get(keys), fetches);
