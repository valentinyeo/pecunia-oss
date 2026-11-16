import { Schema } from "effect";

import type { Exact } from "./codec.js";
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

export type ProviderKind = Exact<typeof ProviderKindSchema.Type>;

export const ProviderSchema = Schema.Struct({
  enabled: Schema.Boolean,
  id: ProviderIdSchema,
  kind: ProviderKindSchema,
  label: Schema.NonEmptyString,
});

export type Provider = Exact<typeof ProviderSchema.Type>;

export const ProviderAccountSchema = Schema.Struct({
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
});

export type ProviderAccount = Exact<typeof ProviderAccountSchema.Type>;
