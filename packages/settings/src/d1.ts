import {
  CurrencyCodeSchema,
  LocaleSchema,
  ProfileIdSchema,
  ProfileKindSchema,
  ProfileNameSchema,
  ProfileNameTaken,
  SettingsUnavailable,
  TimeZoneSchema,
  UnknownProfile,
} from "@pecunia/core/settings";
import type {
  AppSetting,
  NewProfile,
  Profile,
  SettingsSave,
  Setup,
} from "@pecunia/core/settings";
import { SqliteClient } from "@pecunia/database/sqlite-client";
import type { SqliteClientError } from "@pecunia/database/sqlite-client";
import { Clock, Effect, Layer, Schema } from "effect";

import { SettingsStore } from "./settings-store.js";

const ProfileRowSchema = Schema.Struct({
  base_currency: CurrencyCodeSchema,
  id: ProfileIdSchema,
  kind: ProfileKindSchema,
  name: ProfileNameSchema,
});

const SettingRowSchema = Schema.Struct({
  locale: LocaleSchema,
  primary_profile_id: ProfileIdSchema,
  timezone: TimeZoneSchema,
});

const IdRowSchema = Schema.Struct({
  id: Schema.String,
});

const unavailable =
  (operation: "createProfile" | "readSetup" | "saveSetting") =>
  (cause: SqliteClientError) =>
    new SettingsUnavailable({ cause, operation });

const toProfile = (row: typeof ProfileRowSchema.Type): Profile => ({
  baseCurrency: row.base_currency,
  id: row.id,
  kind: row.kind,
  name: row.name,
});

const toSetting = (row: typeof SettingRowSchema.Type): AppSetting => ({
  locale: row.locale,
  primaryProfileId: row.primary_profile_id,
  timezone: row.timezone,
});

const profileIdFromMillis = (millis: number, existingCount: number): string =>
  `profile-${millis.toString(36)}-${existingCount + 1}`;

export const d1SettingsLayer = Layer.effect(
  SettingsStore,
  Effect.gen(function* makeD1SettingsStore() {
    const client = yield* SqliteClient;

    const loadSetup = (
      operation: "createProfile" | "readSetup" | "saveSetting"
    ): Effect.Effect<Setup, SettingsUnavailable> =>
      Effect.gen(function* querySetup() {
        const profileRows = yield* client.query(
          "SELECT id, name, kind, base_currency FROM profiles WHERE archived_at IS NULL ORDER BY created_at ASC, id ASC",
          [],
          ProfileRowSchema
        );

        const settingRows = yield* client.query(
          "SELECT locale, timezone, primary_profile_id FROM app_setting WHERE id = 1",
          [],
          SettingRowSchema
        );

        const firstSetting = settingRows.at(0);

        return {
          profiles: profileRows.map(toProfile),
          setting: firstSetting === undefined ? null : toSetting(firstSetting),
        };
      }).pipe(Effect.mapError(unavailable(operation)));

    const readSetup = Effect.fn("D1SettingsStore.readSetup")(
      function* readSetup() {
        return yield* loadSetup("readSetup");
      }
    );

    const saveSetting = Effect.fn("D1SettingsStore.saveSetting")(
      function* saveSetting(settings: SettingsSave) {
        const existing = yield* client
          .query(
            "SELECT id FROM profiles WHERE id = ? AND archived_at IS NULL",
            [settings.primaryProfileId],
            IdRowSchema
          )
          .pipe(Effect.mapError(unavailable("saveSetting")));

        if (existing.length === 0) {
          return yield* new UnknownProfile({
            profileId: settings.primaryProfileId,
          });
        }

        const updatedAt = yield* Clock.currentTimeMillis;

        yield* client
          .batch([
            {
              params: [settings.baseCurrency, settings.primaryProfileId],
              sql: "UPDATE profiles SET base_currency = ? WHERE id = ? AND archived_at IS NULL",
            },
            {
              params: [
                settings.locale,
                settings.timezone,
                settings.primaryProfileId,
                updatedAt,
              ],
              sql: "INSERT INTO app_setting (id, locale, timezone, primary_profile_id, updated_at) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET locale = excluded.locale, timezone = excluded.timezone, primary_profile_id = excluded.primary_profile_id, updated_at = excluded.updated_at",
            },
          ])
          .pipe(Effect.mapError(unavailable("saveSetting")));

        return yield* loadSetup("saveSetting");
      }
    );

    const createProfile = Effect.fn("D1SettingsStore.createProfile")(
      function* createProfile(profile: NewProfile) {
        const taken = yield* client
          .query(
            "SELECT id FROM profiles WHERE name = ?",
            [profile.name],
            IdRowSchema
          )
          .pipe(Effect.mapError(unavailable("createProfile")));

        if (taken.length > 0) {
          return yield* new ProfileNameTaken({ profileName: profile.name });
        }

        const allProfiles = yield* client
          .query("SELECT id FROM profiles", [], IdRowSchema)
          .pipe(Effect.mapError(unavailable("createProfile")));

        const createdAt = yield* Clock.currentTimeMillis;

        const id = yield* Schema.decodeEffect(ProfileIdSchema)(
          profileIdFromMillis(createdAt, allProfiles.length)
        ).pipe(Effect.orDie);

        yield* client
          .execute(
            "INSERT INTO profiles (id, name, kind, base_currency, created_at, archived_at) VALUES (?, ?, ?, ?, ?, NULL)",
            [id, profile.name, profile.kind, profile.baseCurrency, createdAt]
          )
          .pipe(Effect.mapError(unavailable("createProfile")));

        return { ...profile, id };
      }
    );

    return SettingsStore.of({ createProfile, readSetup, saveSetting });
  })
);
