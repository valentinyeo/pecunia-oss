import { Clock, Context, Effect, Layer, Ref, Schema, Semaphore } from "effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { Unauthenticated } from "./unauthenticated.js";

const KEY_LIFETIME_MILLIS = 60 * 60 * 1000;

const REFRESH_INTERVAL_MILLIS = 60 * 1000;

export const JsonWebKeySchema = Schema.Struct({
  alg: Schema.optional(Schema.String),
  e: Schema.NonEmptyString,
  kid: Schema.NonEmptyString,
  kty: Schema.Literal("RSA"),
  n: Schema.NonEmptyString,
  use: Schema.optional(Schema.String),
});

export type JsonWebKey = typeof JsonWebKeySchema.Type;

export const JsonWebKeySetSchema = Schema.Struct({
  keys: Schema.Array(JsonWebKeySchema),
});

export type JsonWebKeySet = typeof JsonWebKeySetSchema.Type;

interface CachedKeys {
  readonly fetchedAt: number;
  readonly keys: readonly JsonWebKey[];
}

type KeyCache = ReadonlyMap<string, CachedKeys>;

const isReusable = (
  cached: CachedKeys,
  now: number,
  forceRefresh: boolean
): boolean => {
  const age = now - cached.fetchedAt;

  return (
    age < KEY_LIFETIME_MILLIS &&
    (!forceRefresh || age < REFRESH_INTERVAL_MILLIS)
  );
};

const keyFetchFailed = (message: string) =>
  new Unauthenticated({ message, reason: "key" });

export class JwksCache extends Context.Service<
  JwksCache,
  {
    readonly keysFor: (
      url: string,
      forceRefresh: boolean
    ) => Effect.Effect<readonly JsonWebKey[], Unauthenticated>;
  }
>()("@pecunia/access/JwksCache", {
  make: Effect.gen(function* makeJwksCache() {
    const client = yield* HttpClient.HttpClient;
    const cached = yield* Ref.make<KeyCache>(new Map());
    const gate = yield* Semaphore.make(1);

    const fetchKeys = Effect.fn("JwksCache.fetchKeys")(function* fetchKeys(
      url: string
    ) {
      const keySet = yield* client.execute(HttpClientRequest.get(url)).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(JsonWebKeySetSchema)),
        Effect.mapError(() =>
          keyFetchFailed("The Access signing keys could not be read")
        )
      );

      if (keySet.keys.length === 0) {
        return yield* keyFetchFailed("The Access signing key set is empty");
      }

      return keySet.keys;
    });

    const keysFor = Effect.fn("JwksCache.keysFor")(function* keysFor(
      url: string,
      forceRefresh: boolean
    ) {
      return yield* gate.withPermit(
        Effect.gen(function* readThroughCache() {
          const now = yield* Clock.currentTimeMillis;
          const current = (yield* Ref.get(cached)).get(url);

          if (current !== undefined && isReusable(current, now, forceRefresh)) {
            return current.keys;
          }

          const keys = yield* fetchKeys(url);

          yield* Ref.update(cached, (entries) =>
            new Map(entries).set(url, { fetchedAt: now, keys })
          );

          return keys;
        })
      );
    });

    return { keysFor } as const;
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
