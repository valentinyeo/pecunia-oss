import { SetupSchema } from "@pecunia/core/contracts";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

export const Message = defineMessageUnion({
  CompletedLoad: { setup: SetupSchema },
  CompletedSave: { setup: SetupSchema },
  FailedLoad: { reason: Schema.NonEmptyString },
  FailedSave: { reason: Schema.NonEmptyString },
  Retried: {},
  Submitted: {},
  TypedBaseCurrency: { value: Schema.String },
  TypedLocale: { value: Schema.String },
  TypedTimezone: { value: Schema.String },
});

export type SettingsMessageValue = typeof Message.Type;
