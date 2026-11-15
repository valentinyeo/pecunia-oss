import { Schema } from "effect";

import { ProfileIdSchema, ReportIdSchema } from "./primitives.js";

export const ReportSchema = Schema.Struct({
  html: Schema.String,
  id: ReportIdSchema,
  kind: Schema.Literals(["exploration", "report"]),
  profileId: ProfileIdSchema,
  slug: Schema.NonEmptyString.check(
    Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  ),
  title: Schema.NonEmptyString,
});

export type Report = typeof ReportSchema.Type;
