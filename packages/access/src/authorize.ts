import { Effect, Schema } from "effect";

import type { ServiceTokenClaims } from "./claims.js";
import { Forbidden } from "./forbidden.js";
import type { Person, ProfileId } from "./model.js";

export const AccessNeedSchema = Schema.Literals(["read", "write"]);

export type AccessNeed = typeof AccessNeedSchema.Type;

export const ContractNameSchema = Schema.NonEmptyString.pipe(
  Schema.brand("ContractName")
);

export type ContractName = typeof ContractNameSchema.Type;

export const authorize = Effect.fn("authorize")(function* authorize(
  person: Person,
  profileId: ProfileId,
  need: AccessNeed
) {
  const membership = person.memberships.find(
    (candidate) => candidate.profileId === profileId
  );

  if (membership === undefined) {
    return yield* new Forbidden({
      message: `${person.email} is not a member of profile ${profileId}`,
      reason: "notMember",
    });
  }

  if (need === "write" && membership.role !== "owner") {
    return yield* new Forbidden({
      message: `${person.email} is a ${membership.role} on profile ${profileId}`,
      reason: "notOwner",
    });
  }

  return membership;
});

export const authorizeServiceCall = Effect.fn("authorizeServiceCall")(
  function* authorizeServiceCall(
    claims: ServiceTokenClaims,
    contractName: ContractName,
    allowlist: readonly ContractName[]
  ) {
    if (!allowlist.includes(contractName)) {
      return yield* new Forbidden({
        message: `Service token ${claims.clientId} may not call ${contractName}`,
        reason: "serviceToken",
      });
    }

    return contractName;
  }
);
