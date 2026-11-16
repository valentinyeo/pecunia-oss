import { Schema } from "effect";

import { closed } from "./closed-union.js";
import { ProfileIdSchema, ReportIdSchema } from "./primitives.js";

export const ReportSchema = closed(
  Schema.Struct({
    html: Schema.String,
    id: ReportIdSchema,
    kind: Schema.Literals(["exploration", "report"]),
    profileId: ProfileIdSchema,
    slug: Schema.NonEmptyString.check(
      Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    ),
    title: Schema.NonEmptyString,
  })
);

export type Report = typeof ReportSchema.Type;
