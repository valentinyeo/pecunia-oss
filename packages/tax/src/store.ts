import type {
  ProfileId,
  TaxObligation,
  TaxProfile,
  TaxProfileId,
} from "@pecunia/core/model";
import { Context } from "effect";
import type { Effect } from "effect";

import type { DueDeclaration, ReportedKinds, SyncReceipt } from "./model.js";
import type { TaxDueStoreError } from "./tax-due-store-error.js";
import type { UnknownTaxProfile } from "./unknown-tax-profile.js";

export interface ReplaceDuesRequest {
  readonly declarations: readonly DueDeclaration[];
  readonly profileId: ProfileId;
  readonly reportedKinds: ReportedKinds;
  readonly taxProfileId: TaxProfileId;
}

export interface TaxDueStoreService {
  readonly dues: (
    profileId: ProfileId
  ) => Effect.Effect<readonly TaxObligation[], TaxDueStoreError>;
  readonly replace: (
    request: ReplaceDuesRequest
  ) => Effect.Effect<SyncReceipt, TaxDueStoreError | UnknownTaxProfile>;
  readonly taxProfiles: (
    profileId: ProfileId
  ) => Effect.Effect<readonly TaxProfile[], TaxDueStoreError>;
}

export class TaxDueStore extends Context.Service<
  TaxDueStore,
  TaxDueStoreService
>()("@pecunia/tax/TaxDueStore") {}
