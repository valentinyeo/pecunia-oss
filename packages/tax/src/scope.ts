import { authorize } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import type { ProfileId } from "@pecunia/core/model";
import { Effect, Schema } from "effect";

import { ProfileIdSchema } from "./model.js";

export const ReadScopeSchema = Schema.Struct({
  access: Schema.Literals(["read"]),
  profileId: ProfileIdSchema,
}).pipe(Schema.brand("ReadScope"));

export type ReadScope = typeof ReadScopeSchema.Type;

export const WriteScopeSchema = Schema.Struct({
  access: Schema.Literals(["write"]),
  profileId: ProfileIdSchema,
}).pipe(Schema.brand("WriteScope"));

export type WriteScope = typeof WriteScopeSchema.Type;

export const readScopeOf = Effect.fn("readScopeOf")(function* readScopeOf(
  person: Person,
  profileId: ProfileId
) {
  yield* authorize(person, profileId, "read");

  return yield* Schema.decodeEffect(ReadScopeSchema)({
    access: "read",
    profileId,
  }).pipe(Effect.orDie);
});

export const writeScopeOf = Effect.fn("writeScopeOf")(function* writeScopeOf(
  person: Person,
  profileId: ProfileId
) {
  yield* authorize(person, profileId, "write");

  return yield* Schema.decodeEffect(WriteScopeSchema)({
    access: "write",
    profileId,
  }).pipe(Effect.orDie);
});
