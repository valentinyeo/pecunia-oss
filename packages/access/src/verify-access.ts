// @effect-diagnostics-next-line nodeBuiltinImport:off -- The runtime uses the global Web Crypto API; this import only names its key type.
import type { webcrypto } from "node:crypto";

import { Clock, DateTime, Effect, Predicate, Schema } from "effect";

import { accessUrls } from "./access-config.js";
import type { AccessSettings } from "./access-config.js";
import {
  AccessClaimsSchema,
  AccessTokenHeaderSchema,
  RawAccessClaimsSchema,
} from "./claims.js";
import type { AccessTokenHeader, RawAccessClaims } from "./claims.js";
import { JwksCache } from "./jwks.js";
import type { JsonWebKey } from "./jwks.js";
import { EmailSchema, PersonIdSchema } from "./model.js";
import { Unauthenticated } from "./unauthenticated.js";
import type { UnauthenticatedReason } from "./unauthenticated.js";

const MILLIS_PER_SECOND = 1000;

const CLOCK_SKEW_MILLIS = 60 * 1000;

const unauthenticated = (reason: UnauthenticatedReason, message: string) =>
  new Unauthenticated({ message, reason });

const decodeSegment = <
  S extends Schema.Constraint & { readonly DecodingServices: never },
>(
  encoded: string,
  schema: S,
  message: string
): Effect.Effect<S["Type"], Unauthenticated> =>
  Schema.decodeEffect(Schema.StringFromBase64Url)(encoded).pipe(
    Effect.flatMap(Schema.decodeEffect(Schema.fromJsonString(schema))),
    Effect.mapError(() => unauthenticated("malformed", message))
  );

const decodeClaim = <
  S extends Schema.Constraint & { readonly DecodingServices: never },
>(
  schema: S,
  value: string
): Effect.Effect<S["Type"], Unauthenticated> =>
  Schema.decodeEffect(schema)(value).pipe(
    Effect.mapError(() =>
      unauthenticated(
        "claims",
        "The Access token claims carry no usable identity"
      )
    )
  );

const base64UrlBytes = (value: string): Uint8Array => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - (base64.length % 4)) % 4;

  return Uint8Array.from(
    atob(`${base64}${"=".repeat(padding)}`),
    (character) => character.codePointAt(0) ?? 0
  );
};

const signatureBytes = (encoded: string) =>
  Effect.try({
    catch: () =>
      unauthenticated(
        "malformed",
        "The Access token signature is not base64url"
      ),
    try: () => base64UrlBytes(encoded),
  });

const importSigningKey = (key: JsonWebKey) =>
  Effect.tryPromise({
    catch: () =>
      unauthenticated(
        "key",
        "The Access signing key is not a usable RSA public key"
      ),
    try: () =>
      crypto.subtle.importKey(
        "jwk",
        { alg: "RS256", e: key.e, ext: true, kty: "RSA", n: key.n },
        { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
        false,
        ["verify"]
      ),
  });

const signatureMatches = (
  key: webcrypto.CryptoKey,
  signingInput: string,
  signature: Uint8Array
) =>
  Effect.tryPromise({
    catch: () =>
      unauthenticated(
        "signature",
        "The Access token signature could not be checked"
      ),
    try: () =>
      crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        signature,
        new TextEncoder().encode(signingInput)
      ),
  });

const audiencesOf = (raw: RawAccessClaims): readonly string[] =>
  Predicate.isString(raw.aud) ? [raw.aud] : raw.aud;

const keyOf = (keySet: readonly JsonWebKey[], kid: string) =>
  keySet.find((candidate) => candidate.kid === kid);

const signingKeyFor = (
  cache: JwksCache["Service"],
  certsUrl: string,
  kid: string
) =>
  Effect.gen(function* lookupSigningKey() {
    const known = keyOf(yield* cache.keysFor(certsUrl, false), kid);

    if (known !== undefined) {
      return known;
    }

    const refreshed = keyOf(yield* cache.keysFor(certsUrl, true), kid);

    if (refreshed !== undefined) {
      return refreshed;
    }

    return yield* unauthenticated(
      "key",
      `No Access signing key matches ${kid}`
    );
  });

const signatureIsValid = (
  cache: JwksCache["Service"],
  certsUrl: string,
  key: JsonWebKey,
  signingInput: string,
  signature: Uint8Array
) =>
  Effect.gen(function* checkSignature() {
    const importedKey = yield* importSigningKey(key);

    if (yield* signatureMatches(importedKey, signingInput, signature)) {
      return true;
    }

    const rotated = keyOf(yield* cache.keysFor(certsUrl, true), key.kid);

    if (rotated === undefined) {
      return yield* unauthenticated(
        "key",
        `No Access signing key matches ${key.kid}`
      );
    }

    if (
      yield* signatureMatches(
        yield* importSigningKey(rotated),
        signingInput,
        signature
      )
    ) {
      return true;
    }

    return yield* unauthenticated(
      "signature",
      "The Access token signature does not verify"
    );
  });

const registeredClaims = (
  raw: RawAccessClaims,
  settings: AccessSettings,
  now: number
): Effect.Effect<VerifiedClaims, Unauthenticated> =>
  Effect.gen(function* checkRegisteredClaims() {
    const audience = audiencesOf(raw);

    if (!audience.includes(settings.audience)) {
      return yield* unauthenticated(
        "audience",
        "The Access token was issued for a different Access application"
      );
    }

    if (raw.iss !== accessUrls(settings).issuer) {
      return yield* unauthenticated(
        "issuer",
        "The Access token was issued by a different Access team"
      );
    }

    if (now - CLOCK_SKEW_MILLIS > raw.exp * MILLIS_PER_SECOND) {
      return yield* unauthenticated("expired", "The Access token has expired");
    }

    if (now + CLOCK_SKEW_MILLIS < raw.nbf * MILLIS_PER_SECOND) {
      return yield* unauthenticated(
        "notYetValid",
        "The Access token is not valid yet"
      );
    }

    const decodedAudience = yield* Schema.decodeEffect(
      Schema.Array(Schema.NonEmptyString)
    )(audience).pipe(
      Effect.mapError(() =>
        unauthenticated(
          "claims",
          "The Access token audience does not decode as non-empty strings"
        )
      )
    );

    return {
      audience: decodedAudience,
      expiresAt: DateTime.makeUnsafe(raw.exp * MILLIS_PER_SECOND),
      issuedAt: DateTime.makeUnsafe(raw.iat * MILLIS_PER_SECOND),
      issuer: raw.iss,
      notBefore: DateTime.makeUnsafe(raw.nbf * MILLIS_PER_SECOND),
    };
  });

interface VerifiedClaims {
  readonly audience: readonly string[];
  readonly expiresAt: DateTime.Utc;
  readonly issuedAt: DateTime.Utc;
  readonly issuer: string;
  readonly notBefore: DateTime.Utc;
}

const identityOf = (raw: RawAccessClaims, verified: VerifiedClaims) =>
  Effect.gen(function* claimIdentity() {
    if (raw.common_name !== undefined && raw.common_name !== "") {
      const clientId = yield* decodeClaim(
        Schema.NonEmptyString,
        raw.common_name
      );

      return AccessClaimsSchema.cases.ServiceToken.make({
        ...verified,
        clientId,
      });
    }

    if (
      raw.email !== undefined &&
      raw.email !== "" &&
      raw.sub !== undefined &&
      raw.sub !== ""
    ) {
      const email = yield* decodeClaim(EmailSchema, raw.email);
      const personId = yield* decodeClaim(PersonIdSchema, raw.sub);

      return AccessClaimsSchema.cases.Person.make({
        ...verified,
        email,
        personId,
      });
    }

    return yield* unauthenticated(
      "claims",
      "The Access token names neither a person email nor a service token"
    );
  });

const parseSegments = (token: string) => {
  const segments = token.split(".");
  const [encodedHeader, encodedPayload, encodedSignature] = segments;

  return segments.length === 3 &&
    encodedHeader !== undefined &&
    encodedPayload !== undefined &&
    encodedSignature !== undefined
    ? { encodedHeader, encodedPayload, encodedSignature }
    : undefined;
};

export const verifyAccess = Effect.fn("verifyAccess")(function* verifyAccess(
  token: string,
  settings: AccessSettings
) {
  const segments = parseSegments(token);

  if (segments === undefined) {
    return yield* unauthenticated(
      "malformed",
      "The Access token is not a signed JWS"
    );
  }

  const header: AccessTokenHeader = yield* decodeSegment(
    segments.encodedHeader,
    AccessTokenHeaderSchema,
    "The Access token header is not a JOSE header"
  );

  if (header.alg !== "RS256") {
    return yield* unauthenticated(
      "algorithm",
      `The Access token uses ${header.alg}; only RS256 is accepted`
    );
  }

  const { kid } = header;

  if (kid === undefined) {
    return yield* unauthenticated(
      "key",
      "The Access token header names no signing key"
    );
  }

  const raw = yield* decodeSegment(
    segments.encodedPayload,
    RawAccessClaimsSchema,
    "The Access token claims are not readable"
  );

  const cache = yield* JwksCache;
  const certsUrl = accessUrls(settings).certs;
  const signingKey = yield* signingKeyFor(cache, certsUrl, kid);
  const signingInput = `${segments.encodedHeader}.${segments.encodedPayload}`;
  const signature = yield* signatureBytes(segments.encodedSignature);

  yield* signatureIsValid(cache, certsUrl, signingKey, signingInput, signature);

  const verified = yield* registeredClaims(
    raw,
    settings,
    yield* Clock.currentTimeMillis
  );

  return yield* identityOf(raw, verified);
});
