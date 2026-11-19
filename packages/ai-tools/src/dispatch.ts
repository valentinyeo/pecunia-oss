import { ProfileIdSchema } from "@pecunia/access";
import { Clock, Effect, Option, Schema } from "effect";

import { AuditLog, AuditOutcomeSchema } from "./audit.js";
import type { AuditOutcome } from "./audit.js";
import { ToolCaller, callerGrantOf } from "./caller.js";
import { ToolCatalog, toolNamed } from "./catalog.js";
import { TOOL_NAMES } from "./contracts.js";
import { RefusalReasonSchema, ToolRefused } from "./refusal.js";

const MAX_TOOL_NAME = 64;

export interface ToolRequest {
  readonly input: Schema.Json;
  readonly tool: string;
}

export const ToolCallOutcomeSchema = Schema.TaggedUnion({
  Ok: { output: Schema.Unknown },
  Refused: {
    field: Schema.optional(Schema.String),
    message: Schema.String,
    reason: RefusalReasonSchema,
  },
});

export type ToolCallOutcome = typeof ToolCallOutcomeSchema.Type;

export const ToolCallSchema = Schema.Struct({
  outcome: ToolCallOutcomeSchema,
  profileId: ProfileIdSchema,
  tool: Schema.String.check(Schema.isMaxLength(MAX_TOOL_NAME)),
});

export type ToolCall = typeof ToolCallSchema.Type;

const jsonSize = (value: Schema.Json): number => JSON.stringify(value).length;

const requestedName = (tool: string): string => tool.slice(0, MAX_TOOL_NAME);

const refusalOutcome = (refusal: ToolRefused): ToolCallOutcome => {
  const { field, message, reason } = refusal;

  return field === undefined
    ? ToolCallOutcomeSchema.cases.Refused.make({ message, reason })
    : ToolCallOutcomeSchema.cases.Refused.make({ field, message, reason });
};

export const dispatchTool = (request: ToolRequest) =>
  Effect.gen(function* dispatchOneCall() {
    const audit = yield* AuditLog;
    const caller = yield* ToolCaller;
    const grant = yield* callerGrantOf(caller.person, caller.profileId);
    const atMillis = yield* Clock.currentTimeMillis;
    const tool = requestedName(request.tool);

    const envelope = (outcome: ToolCallOutcome): ToolCall => ({
      outcome,
      profileId: caller.profileId,
      tool,
    });

    const record = (outcome: AuditOutcome) =>
      audit.append({
        access: grant,
        atMillis,
        inputSize: jsonSize(request.input),
        outcome,
        profileId: caller.profileId,
        tool,
      });

    const refuse = (refusal: ToolRefused) =>
      record(
        AuditOutcomeSchema.cases.Refused.make({ reason: refusal.reason })
      ).pipe(Effect.map(() => envelope(refusalOutcome(refusal))));

    const definition = toolNamed(ToolCatalog, request.tool);

    if (Option.isNone(definition)) {
      return yield* refuse(
        new ToolRefused({
          message: `No tool named ${tool}. Fix: call one of ${TOOL_NAMES.join(", ")}.`,
          reason: "unknownTool",
        })
      );
    }

    const chosen = definition.value;

    if (grant === null) {
      return yield* refuse(
        new ToolRefused({
          message: `The acting person is not a member of profile ${caller.profileId}. Fix: act for a profile the person belongs to.`,
          reason: "notPermitted",
        })
      );
    }

    if (chosen.access === "write" && grant === "read") {
      return yield* refuse(
        new ToolRefused({
          message: `Tool ${chosen.name} writes, and the acting person is a viewer of profile ${caller.profileId}. Fix: ask an owner of the profile to run it.`,
          reason: "notPermitted",
        })
      );
    }

    return yield* chosen.call(request.input).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (result) =>
          record(
            AuditOutcomeSchema.cases.Ok.make({ outputSize: result.outputSize })
          ).pipe(
            Effect.map(() =>
              envelope(
                ToolCallOutcomeSchema.cases.Ok.make({ output: result.output })
              )
            )
          ),
      })
    );
  });
