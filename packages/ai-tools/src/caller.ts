import { authorize } from "@pecunia/access";
import type { AccessNeed, Person, ProfileId } from "@pecunia/access";
import { Context, Effect } from "effect";

export interface CallerIdentity {
  readonly person: Person;
  readonly profileId: ProfileId;
}

export class ToolCaller extends Context.Service<ToolCaller, CallerIdentity>()(
  "@pecunia/ai-tools/ToolCaller"
) {}

export const callerGrantOf = (
  person: Person,
  profileId: ProfileId
): Effect.Effect<AccessNeed | null> =>
  authorize(person, profileId, "read").pipe(
    Effect.map((membership) =>
      membership.role === "owner" ? "write" : "read"
    ),
    Effect.catchTag("Forbidden", () => Effect.succeed(null))
  );
