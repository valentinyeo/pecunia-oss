import {
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

interface MemorySettings {
  readonly profiles: readonly Profile[];
  readonly setting: AppSetting | undefined;
}

const setupOf = (state: MemorySettings): Setup => ({
  profiles: state.profiles,
  setting: state.setting ?? null,
});

const withCurrency = (profile: Profile, settings: SettingsSave): Profile =>
  profile.id === settings.primaryProfileId
    ? { ...profile, baseCurrency: settings.baseCurrency }
    : profile;

export const memorySettingsLayer = (seed: SettingsSeed = emptySettings) =>
  Layer.effect(
    SettingsStore,
    Effect.gen(function* makeMemorySettings() {
      const state = yield* Ref.make<MemorySettings>({
        profiles: seed.profiles,
        setting: seed.setting,
      });

      const writes = yield* Semaphore.make(1);
      const nextProfile = yield* Ref.make(1);

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

              const saved: MemorySettings = {
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

              const sequence = yield* Ref.updateAndGet(
                nextProfile,
                (count) => count + 1
              );

              const id = yield* Schema.decodeEffect(ProfileIdSchema)(
                `profile-${sequence}`
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
