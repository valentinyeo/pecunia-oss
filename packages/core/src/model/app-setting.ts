import { Schema } from "effect";

import type { Exact } from "./codec.js";
import { ProfileIdSchema } from "./primitives.js";

export const AppSettingSchema = Schema.Struct({
  locale: Schema.NonEmptyString,
  primaryProfileId: ProfileIdSchema,
  timezone: Schema.NonEmptyString,
});

export type AppSetting = Exact<typeof AppSettingSchema.Type>;
