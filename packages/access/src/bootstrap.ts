import { Effect } from "effect";

import { BootstrapClosed } from "./bootstrap-closed.js";
import { MembershipDirectory } from "./membership.js";
import type { MemberInvite } from "./model.js";

export const bootstrap = Effect.fn("bootstrap")(function* bootstrap(
  invite: MemberInvite
) {
  const directory = yield* MembershipDirectory;
  const members = yield* directory.countMembers();

  if (members > 0) {
    return yield* new BootstrapClosed({
      message: "The first owner already exists, so bootstrap is closed",
      profileId: invite.profileId,
    });
  }

  return yield* directory.insertFirstOwner(invite);
});
