import { Schema } from "effect";

import { closed } from "./closed-union.js";
import {
  DateOnlySchema,
  ProfileIdSchema,
  ProviderAccountIdSchema,
  ProviderIdSchema,
  TimestampSchema,
} from "./primitives.js";

export const ProviderKindSchema = Schema.Literals([
  "books",
  "investment",
  "bank",
  "csv",
  "manual",
]);

export type ProviderKind = typeof ProviderKindSchema.Type;

export const ProviderSchema = closed(
  Schema.Struct({
    enabled: Schema.Boolean,
    id: ProviderIdSchema,
    kind: ProviderKindSchema,
    label: Schema.NonEmptyString,
  })
);

export type Provider = typeof ProviderSchema.Type;

export const ProviderAccountSchema = closed(
  Schema.Struct({
    createdAt: TimestampSchema,
    credentialKey: Schema.optional(Schema.NonEmptyString),
    externalId: Schema.NonEmptyString,
    id: ProviderAccountIdSchema,
    kind: ProviderKindSchema,
    label: Schema.NonEmptyString,
    lastSyncedAt: Schema.optional(TimestampSchema),
    profileId: ProfileIdSchema,
    providerId: ProviderIdSchema,
    syncStartDate: Schema.optional(DateOnlySchema),
  })
);

export type ProviderAccount = typeof ProviderAccountSchema.Type;
