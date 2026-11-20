import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { DuplicateHolding } from "./duplicate-holding.js";
import type { InvestmentsUnavailable } from "./investments-unavailable.js";
import type { MismatchedProfile } from "./mismatched-profile.js";
import type {
  Holding,
  HoldingId,
  HoldingPatch,
  InvestmentPlatform,
  ProfileId,
} from "./model.js";

export type UpsertOutcome = "created" | "updated";

export interface InvestmentStoreService {
  readonly holdings: (
    profileId: ProfileId
  ) => Effect.Effect<readonly Holding[], InvestmentsUnavailable>;
  readonly insert: (
    profileId: ProfileId,
    holding: Holding
  ) => Effect.Effect<
    Holding,
    DuplicateHolding | InvestmentsUnavailable | MismatchedProfile
  >;
  readonly platforms: () => Effect.Effect<
    readonly InvestmentPlatform[],
    InvestmentsUnavailable
  >;
  readonly remove: (
    profileId: ProfileId,
    holdingId: HoldingId
  ) => Effect.Effect<Option.Option<Holding>, InvestmentsUnavailable>;
  readonly update: (
    profileId: ProfileId,
    holdingId: HoldingId,
    patch: HoldingPatch
  ) => Effect.Effect<Option.Option<Holding>, InvestmentsUnavailable>;
  readonly upsert: (
    profileId: ProfileId,
    holding: Holding
  ) => Effect.Effect<UpsertOutcome, InvestmentsUnavailable | MismatchedProfile>;
}

export class InvestmentStore extends Context.Service<
  InvestmentStore,
  InvestmentStoreService
>()("@pecunia/investments/InvestmentStore") {}
