import { Schema } from "effect";

import { ProfileIdSchema } from "./primitives.js";

export const AppSettingSchema = Schema.Struct({
  locale: Schema.NonEmptyString,
  primaryProfileId: ProfileIdSchema,
  timezone: Schema.NonEmptyString,
});

export type AppSetting = typeof AppSettingSchema.Type;
