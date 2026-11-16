import { Schema } from "effect";

import { closed } from "./closed-union.js";
import {
  CurrencyCodeSchema,
  MemberIdSchema,
  ProfileIdSchema,
  TimestampSchema,
} from "./primitives.js";

export const ProfileKindSchema = Schema.Literals(["business", "personal"]);

export type ProfileKind = typeof ProfileKindSchema.Type;

export const ProfileSchema = closed(
  Schema.Struct({
    baseCurrency: CurrencyCodeSchema,
    createdAt: TimestampSchema,
    id: ProfileIdSchema,
    kind: ProfileKindSchema,
    name: Schema.NonEmptyString,
  })
);

export type Profile = typeof ProfileSchema.Type;

export const RoleSchema = Schema.Literals(["owner", "viewer"]);

export type Role = typeof RoleSchema.Type;

export const MemberSchema = closed(
  Schema.Struct({
    createdAt: TimestampSchema,
    email: Schema.NonEmptyString,
    id: MemberIdSchema,
    profileId: ProfileIdSchema,
    role: RoleSchema,
  })
);

export type Member = typeof MemberSchema.Type;
