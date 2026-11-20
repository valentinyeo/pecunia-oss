import { authorize } from "@pecunia/access";
import type { Person } from "@pecunia/access";
import { Effect, Schema } from "effect";

import type { ProfileId } from "./model.js";
import { ProfileIdSchema } from "./model.js";

export const ReadScopeSchema = Schema.Struct({
  access: Schema.Literals(["read"]),
  profileId: ProfileIdSchema,
}).pipe(Schema.brand("ReadScope"));

export type ReadScope = typeof ReadScopeSchema.Type;

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
