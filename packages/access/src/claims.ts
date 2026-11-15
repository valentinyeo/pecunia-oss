import { Schema } from "effect";

import { EmailSchema, PersonIdSchema } from "./model.js";

const verifiedClaims = {
  audience: Schema.Array(Schema.NonEmptyString),
  expiresAt: Schema.DateTimeUtc,
  issuedAt: Schema.DateTimeUtc,
  issuer: Schema.NonEmptyString,
  notBefore: Schema.DateTimeUtc,
} as const;

export const AccessClaimsSchema = Schema.TaggedUnion({
  Person: {
    ...verifiedClaims,
    email: EmailSchema,
    personId: PersonIdSchema,
  },
  ServiceToken: {
    ...verifiedClaims,
    clientId: Schema.NonEmptyString,
  },
});

export type AccessClaims = typeof AccessClaimsSchema.Type;

export type PersonClaims = Extract<AccessClaims, { readonly _tag: "Person" }>;

export type ServiceTokenClaims = Extract<
  AccessClaims,
  { readonly _tag: "ServiceToken" }
>;

export const AccessTokenHeaderSchema = Schema.Struct({
  alg: Schema.String,
  kid: Schema.optional(Schema.String),
  typ: Schema.optional(Schema.String),
});

export type AccessTokenHeader = typeof AccessTokenHeaderSchema.Type;

export const RawAccessClaimsSchema = Schema.Struct({
  aud: Schema.Union([Schema.Array(Schema.String), Schema.String]),
  common_name: Schema.optional(Schema.String),
  email: Schema.optional(Schema.String),
  exp: Schema.Int,
  iat: Schema.Int,
  iss: Schema.String,
  nbf: Schema.Int,
  sub: Schema.optional(Schema.String),
});

export type RawAccessClaims = typeof RawAccessClaimsSchema.Type;
