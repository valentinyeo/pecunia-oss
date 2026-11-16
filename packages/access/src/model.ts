import { Schema } from "effect";

export const ProfileIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("ProfileId")
);

export type ProfileId = typeof ProfileIdSchema.Type;

export const MemberIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("MemberId")
);

export type MemberId = typeof MemberIdSchema.Type;

export const PersonIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("PersonId")
);

export type PersonId = typeof PersonIdSchema.Type;

export const EmailSchema = Schema.NonEmptyString.pipe(Schema.brand("Email"));

export type Email = typeof EmailSchema.Type;

export const RoleSchema = Schema.Literals(["owner", "viewer"]);

export type Role = typeof RoleSchema.Type;

export const MemberSchema = Schema.Struct({
  createdAt: Schema.Date,
  email: EmailSchema,
  id: MemberIdSchema,
  profileId: ProfileIdSchema,
  role: RoleSchema,
});

export type Member = typeof MemberSchema.Type;

export const MemberInviteSchema = Schema.Struct({
  email: EmailSchema,
  profileId: ProfileIdSchema,
});

export type MemberInvite = typeof MemberInviteSchema.Type;

export const MembershipGrantSchema = Schema.Struct({
  email: EmailSchema,
  profileId: ProfileIdSchema,
  role: RoleSchema,
});

export type MembershipGrant = typeof MembershipGrantSchema.Type;

export const MembershipSchema = Schema.Struct({
  profileId: ProfileIdSchema,
  role: RoleSchema,
});

export type Membership = typeof MembershipSchema.Type;

export const PersonSchema = Schema.Struct({
  email: EmailSchema,
  memberships: Schema.Array(MembershipSchema),
  personId: PersonIdSchema,
});

export type Person = typeof PersonSchema.Type;
