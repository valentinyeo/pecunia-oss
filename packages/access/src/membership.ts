import { Context } from "effect";
import type { Effect } from "effect";

import type { BootstrapClosed } from "./bootstrap-closed.js";
import type { DirectoryUnavailable } from "./directory-unavailable.js";
import type { LastOwner } from "./last-owner.js";
import type { MemberNotFound } from "./member-not-found.js";
import type {
  Email,
  Member,
  MemberId,
  MemberInvite,
  MembershipGrant,
} from "./model.js";

export class MembershipDirectory extends Context.Service<
  MembershipDirectory,
  {
    readonly countMembers: () => Effect.Effect<number, DirectoryUnavailable>;
    readonly findByEmail: (
      email: Email
    ) => Effect.Effect<readonly Member[], DirectoryUnavailable>;
    readonly grant: (
      grant: MembershipGrant
    ) => Effect.Effect<Member, DirectoryUnavailable | LastOwner>;
    readonly insertFirstOwner: (
      invite: MemberInvite
    ) => Effect.Effect<Member, BootstrapClosed | DirectoryUnavailable>;
    readonly revoke: (
      memberId: MemberId
    ) => Effect.Effect<
      MemberId,
      DirectoryUnavailable | LastOwner | MemberNotFound
    >;
  }
>()("@pecunia/access/MembershipDirectory") {}
