import { Effect } from "effect";

import { MembershipDirectory } from "./membership.js";
import type { MemberInvite } from "./model.js";

export const bootstrap = Effect.fn("bootstrap")(function* bootstrap(
  invite: MemberInvite
) {
  const directory = yield* MembershipDirectory;

  return yield* directory.insertFirstOwner(invite);
});
