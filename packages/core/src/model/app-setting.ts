import { Schema } from "effect";

import { closed } from "./closed-union.js";
import { ProfileIdSchema } from "./primitives.js";

export const AppSettingSchema = closed(
  Schema.Struct({
    locale: Schema.NonEmptyString,
    primaryProfileId: ProfileIdSchema,
    timezone: Schema.NonEmptyString,
  })
);

export type AppSetting = typeof AppSettingSchema.Type;
