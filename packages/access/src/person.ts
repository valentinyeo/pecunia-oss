import { Context, Effect } from "effect";

import type { PersonClaims } from "./claims.js";
import { MembershipDirectory } from "./membership.js";
import type { Person } from "./model.js";

export class CurrentPerson extends Context.Service<CurrentPerson, Person>()(
  "@pecunia/access/CurrentPerson"
) {}

export const resolvePerson = Effect.fn("resolvePerson")(function* resolvePerson(
  claims: PersonClaims
) {
  const directory = yield* MembershipDirectory;
  const members = yield* directory.findByEmail(claims.email);

  return {
    email: claims.email,
    memberships: members.map(({ profileId, role }) => ({ profileId, role })),
    personId: claims.personId,
  };
});
