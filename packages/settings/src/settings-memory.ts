import {
  DuplicateProfileId,
  ProfileIdSchema,
  ProfileNameTaken,
  UnknownProfile,
} from "@pecunia/core/settings";
import type {
  AppSetting,
  NewProfile,
  Profile,
  SettingsSave,
  Setup,
} from "@pecunia/core/settings";
import { Effect, Layer, Ref, Schema, Semaphore } from "effect";

import { SettingsStore } from "./settings-store.js";

export interface SettingsSeed {
  readonly profiles: readonly Profile[];
  readonly setting: AppSetting | undefined;
}

export const emptySettings: SettingsSeed = {
  profiles: [],
  setting: undefined,
};

const setupOf = (state: SettingsSeed): Setup => ({
  profiles: state.profiles,
  setting: state.setting ?? null,
});

const withCurrency = (profile: Profile, settings: SettingsSave): Profile =>
  profile.id === settings.primaryProfileId
    ? { ...profile, baseCurrency: settings.baseCurrency }
    : profile;

const firstRepeatedProfileId = (profiles: readonly Profile[]) => {
  const seen = new Set<string>();

  return profiles.find((profile) => {
    if (seen.has(profile.id)) {
      return true;
    }

    seen.add(profile.id);

    return false;
  })?.id;
};

const unusedProfileSequence = (profiles: readonly Profile[]) => {
  const taken = new Set<string>(profiles.map((profile) => profile.id));
  let sequence = profiles.length + 1;

  while (taken.has(`profile-${sequence}`)) {
    sequence += 1;
  }

  return sequence;
};

export const memorySettingsLayer = (seed: SettingsSeed = emptySettings) =>
  Layer.effect(
    SettingsStore,
    Effect.gen(function* makeMemorySettings() {
      const repeatedId = firstRepeatedProfileId(seed.profiles);

      if (repeatedId !== undefined) {
        return yield* Effect.die(
          new DuplicateProfileId({ profileId: repeatedId })
        );
      }

      const state = yield* Ref.make<SettingsSeed>({
        profiles: seed.profiles,
        setting: seed.setting,
      });

      const writes = yield* Semaphore.make(1);

      const readSetup = Effect.fn("SettingsStore.readSetup")(
        function* readSetup() {
          return setupOf(yield* Ref.get(state));
        }
      );

      const saveSetting = Effect.fn("SettingsStore.saveSetting")(
        function* saveSetting(settings: SettingsSave) {
          return yield* writes.withPermit(
            Effect.gen(function* saveSettings() {
              const current = yield* Ref.get(state);

              if (
                !current.profiles.some(
                  (profile) => profile.id === settings.primaryProfileId
                )
              ) {
                return yield* new UnknownProfile({
                  profileId: settings.primaryProfileId,
                });
              }

              const saved: SettingsSeed = {
                profiles: current.profiles.map((profile) =>
                  withCurrency(profile, settings)
                ),
                setting: {
                  locale: settings.locale,
                  primaryProfileId: settings.primaryProfileId,
                  timezone: settings.timezone,
                },
              };

              yield* Ref.set(state, saved);

              return setupOf(saved);
            })
          );
        }
      );

      const createProfile = Effect.fn("SettingsStore.createProfile")(
        function* createProfile(profile: NewProfile) {
          return yield* writes.withPermit(
            Effect.gen(function* addProfile() {
              const current = yield* Ref.get(state);

              if (
                current.profiles.some((stored) => stored.name === profile.name)
              ) {
                return yield* new ProfileNameTaken({
                  profileName: profile.name,
                });
              }

              const id = yield* Schema.decodeEffect(ProfileIdSchema)(
                `profile-${unusedProfileSequence(current.profiles)}`
              ).pipe(Effect.orDie);

              const created: Profile = { ...profile, id };

              yield* Ref.set(state, {
                ...current,
                profiles: [...current.profiles, created],
              });

              return created;
            })
          );
        }
      );

      return SettingsStore.of({ createProfile, readSetup, saveSetting });
    })
  );
