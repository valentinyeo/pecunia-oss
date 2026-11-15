import { DateTime, Effect, Layer, Ref, Schema, Semaphore } from "effect";

import { BootstrapClosed } from "./bootstrap-closed.js";
import { LastOwner } from "./last-owner.js";
import { MemberNotFound } from "./member-not-found.js";
import { MembershipDirectory } from "./membership.js";
import { MemberIdSchema } from "./model.js";
import type {
  Email,
  Member,
  MemberId,
  MemberInvite,
  MembershipGrant,
  ProfileId,
  Role,
} from "./model.js";

interface MemoryDirectory {
  readonly members: readonly Member[];
  readonly nextId: number;
}

const emptyDirectory: MemoryDirectory = { members: [], nextId: 1 };

const newMember = (
  id: number,
  email: Email,
  profileId: ProfileId,
  role: Role
) =>
  Effect.gen(function* buildMember() {
    const createdAt = DateTime.toDate(yield* DateTime.now);

    const memberId = yield* Schema.decodeEffect(MemberIdSchema)(
      `member-${id}`
    ).pipe(Effect.orDie);

    return { createdAt, email, id: memberId, profileId, role };
  });

export const memoryMembershipLayer = Layer.effect(
  MembershipDirectory,
  Effect.gen(function* makeMemoryDirectory() {
    const state = yield* Ref.make<MemoryDirectory>(emptyDirectory);
    const gate = yield* Semaphore.make(1);

    const countMembers = Effect.fn("MembershipDirectory.countMembers")(
      function* countMembers() {
        const { members } = yield* Ref.get(state);

        return members.length;
      }
    );

    const findByEmail = Effect.fn("MembershipDirectory.findByEmail")(
      function* findByEmail(email: Email) {
        const { members } = yield* Ref.get(state);

        return members.filter((member) => member.email === email);
      }
    );

    const grant = Effect.fn("MembershipDirectory.grant")(function* grant(
      input: MembershipGrant
    ) {
      return yield* gate.withPermit(
        Effect.gen(function* grantMembership() {
          const current = yield* Ref.get(state);

          const existing = current.members.find(
            (member) =>
              member.email === input.email &&
              member.profileId === input.profileId
          );

          if (existing !== undefined) {
            const updated: Member = { ...existing, role: input.role };

            yield* Ref.set(state, {
              ...current,
              members: current.members.map((member) =>
                member.id === existing.id ? updated : member
              ),
            });

            return updated;
          }

          const member = yield* newMember(
            current.nextId,
            input.email,
            input.profileId,
            input.role
          );

          yield* Ref.set(state, {
            members: [...current.members, member],
            nextId: current.nextId + 1,
          });

          return member;
        })
      );
    });

    const insertFirstOwner = Effect.fn("MembershipDirectory.insertFirstOwner")(
      function* insertFirstOwner(invite: MemberInvite) {
        return yield* gate.withPermit(
          Effect.gen(function* insertOwner() {
            const current = yield* Ref.get(state);

            if (current.members.length > 0) {
              return yield* new BootstrapClosed({
                message:
                  "The first owner already exists, so bootstrap is closed",
                profileId: invite.profileId,
              });
            }

            const member = yield* newMember(
              current.nextId,
              invite.email,
              invite.profileId,
              "owner"
            );

            yield* Ref.set(state, {
              members: [member],
              nextId: current.nextId + 1,
            });

            return member;
          })
        );
      }
    );

    const revoke = Effect.fn("MembershipDirectory.revoke")(function* revoke(
      memberId: MemberId
    ) {
      return yield* gate.withPermit(
        Effect.gen(function* revokeMember() {
          const current = yield* Ref.get(state);

          const target = current.members.find(
            (member) => member.id === memberId
          );

          if (target === undefined) {
            return yield* new MemberNotFound({ memberId });
          }

          const owners = current.members.filter(
            (member) =>
              member.profileId === target.profileId && member.role === "owner"
          );

          if (target.role === "owner" && owners.length === 1) {
            return yield* new LastOwner({
              memberId,
              profileId: target.profileId,
            });
          }

          yield* Ref.set(state, {
            ...current,
            members: current.members.filter((member) => member.id !== memberId),
          });

          return memberId;
        })
      );
    });

    return { countMembers, findByEmail, grant, insertFirstOwner, revoke };
  })
);
