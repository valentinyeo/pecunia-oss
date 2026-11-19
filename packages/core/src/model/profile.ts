import { Schema } from "effect";

import type { Exact } from "./codec.js";
import {
  CurrencyCodeSchema,
  MemberIdSchema,
  ProfileIdSchema,
  TimestampSchema,
} from "./primitives.js";

export const ProfileKindSchema = Schema.Literals(["business", "personal"]);

export type ProfileKind = Exact<typeof ProfileKindSchema.Type>;

export const ProfileSchema = Schema.Struct({
  baseCurrency: CurrencyCodeSchema,
  createdAt: TimestampSchema,
  id: ProfileIdSchema,
  kind: ProfileKindSchema,
  name: Schema.NonEmptyString,
});

export type Profile = Exact<typeof ProfileSchema.Type>;

export const RoleSchema = Schema.Literals(["owner", "viewer"]);

export type Role = Exact<typeof RoleSchema.Type>;

export const MemberSchema = Schema.Struct({
  createdAt: TimestampSchema,
  email: Schema.NonEmptyString,
  id: MemberIdSchema,
  profileId: ProfileIdSchema,
  role: RoleSchema,
});

export type Member = Exact<typeof MemberSchema.Type>;
