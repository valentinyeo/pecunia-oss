import { Schema } from "effect";

const Uuid7 = Schema.String.check(Schema.isUUID(7));

export const ProfileIdSchema = Uuid7.pipe(Schema.brand("ProfileId"));

export type ProfileId = typeof ProfileIdSchema.Type;

export const CategoryIdSchema = Uuid7.pipe(Schema.brand("CategoryId"));

export type CategoryId = typeof CategoryIdSchema.Type;

export const PayeeIdSchema = Uuid7.pipe(Schema.brand("PayeeId"));

export type PayeeId = typeof PayeeIdSchema.Type;

export const RuleIdSchema = Uuid7.pipe(Schema.brand("RuleId"));

export type RuleId = typeof RuleIdSchema.Type;

export const AliasIdSchema = Uuid7.pipe(Schema.brand("AliasId"));

export type AliasId = typeof AliasIdSchema.Type;
