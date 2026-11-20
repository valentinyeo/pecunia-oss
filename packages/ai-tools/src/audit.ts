import { AccessNeedSchema, ProfileIdSchema } from "@pecunia/access";
import { Context, Effect, Layer, Ref, Schema } from "effect";

import { RefusalReasonSchema } from "./refusal.js";

export const AuditOutcomeSchema = Schema.TaggedUnion({
  Ok: { outputSize: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) },
  Refused: { reason: RefusalReasonSchema },
});

export type AuditOutcome = typeof AuditOutcomeSchema.Type;

export const AuditEntrySchema = Schema.Struct({
  access: Schema.NullOr(AccessNeedSchema),
  atMillis: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  inputSize: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  outcome: AuditOutcomeSchema,
  profileId: ProfileIdSchema,
  tool: Schema.String.check(Schema.isMaxLength(64)),
});

export type AuditEntry = typeof AuditEntrySchema.Type;

export interface AuditLogPort {
  readonly append: (entry: AuditEntry) => Effect.Effect<void>;
  readonly entries: () => Effect.Effect<readonly AuditEntry[]>;
}

export class AuditLog extends Context.Service<AuditLog, AuditLogPort>()(
  "@pecunia/ai-tools/AuditLog"
) {}

export const memoryAuditLogLayer = Layer.effect(
  AuditLog,
  Effect.gen(function* makeMemoryAuditLog() {
    const entries = yield* Ref.make<readonly AuditEntry[]>([]);

    return {
      append: (entry) => Ref.update(entries, (current) => [...current, entry]),
      entries: () => Ref.get(entries),
    } as const;
  })
);
