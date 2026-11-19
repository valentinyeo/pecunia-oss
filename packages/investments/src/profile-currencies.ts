import { UnknownProfile } from "@pecunia/core/settings";
import { Context, Effect, Layer } from "effect";

import type { InvestmentsUnavailable } from "./investments-unavailable.js";
import type { CurrencyCode, ProfileId } from "./model.js";

export interface ProfileCurrencyEntry {
  readonly baseCurrency: CurrencyCode;
  readonly profileId: ProfileId;
}

export class ProfileCurrencies extends Context.Service<
  ProfileCurrencies,
  {
    readonly baseCurrency: (
      profileId: ProfileId
    ) => Effect.Effect<CurrencyCode, InvestmentsUnavailable | UnknownProfile>;
  }
>()("@pecunia/investments/ProfileCurrencies") {}

export const memoryProfileCurrenciesLayer = (
  entries: readonly ProfileCurrencyEntry[]
) => {
  const table = new Map<ProfileId, CurrencyCode>();

  for (const entry of entries) {
    table.set(entry.profileId, entry.baseCurrency);
  }

  return Layer.succeed(ProfileCurrencies, {
    baseCurrency: Effect.fn("MemoryProfileCurrencies.baseCurrency")(
      function* baseCurrency(profileId: ProfileId) {
        const currency = table.get(profileId);

        if (currency !== undefined) {
          return currency;
        }

        return yield* new UnknownProfile({ profileId });
      }
    ),
  });
};
