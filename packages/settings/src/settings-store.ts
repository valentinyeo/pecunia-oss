import type {
  NewProfile,
  Profile,
  ProfileNameTaken,
  SettingsSave,
  SettingsUnavailable,
  Setup,
  UnknownProfile,
} from "@pecunia/core/settings";
import { Context } from "effect";
import type { Effect } from "effect";

export class SettingsStore extends Context.Service<
  SettingsStore,
  {
    readonly createProfile: (
      profile: NewProfile
    ) => Effect.Effect<Profile, ProfileNameTaken | SettingsUnavailable>;
    readonly readSetup: () => Effect.Effect<Setup, SettingsUnavailable>;
    readonly saveSetting: (
      settings: SettingsSave
    ) => Effect.Effect<Setup, SettingsUnavailable | UnknownProfile>;
  }
>()("@pecunia/settings/SettingsStore") {}
