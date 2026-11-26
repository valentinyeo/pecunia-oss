import { describe, expect, it } from "@effect/vitest";
import {
  CurrencyCodeSchema,
  LocaleSchema,
  ProfileIdSchema,
  ProfileNameSchema,
  TimeZoneSchema,
} from "@pecunia/core/settings";
import { openDemoSqliteLayer } from "@pecunia/database/node-sqlite";
import { Effect, Layer, Schema } from "effect";

import { createProfile, readSetup, saveSettings } from "../src/capabilities.js";
import { d1SettingsLayer } from "../src/d1.js";

const demoD1SettingsLayer = () =>
  d1SettingsLayer.pipe(Layer.provide(openDemoSqliteLayer()));

describe("d1SettingsLayer against migrated demo D1 schema", () => {
  it.effect(
    "reads seeded profiles and settings, saves changes, and persists them",
    () =>
      Effect.gen(function* testReadAndSave() {
        const initial = yield* readSetup.handler({});

        expect(initial.profiles.map((profile) => profile.name)).toEqual([
          "Example Ltd",
          "Demo Person",
        ]);
        expect(initial.setting?.locale).toBe("en-GB");
        expect(initial.setting?.timezone).toBe("Europe/London");

        const primaryId = yield* Schema.decodeEffect(ProfileIdSchema)(
          "0192f0c1-0001-702d-8484-48490b729601"
        );

        const locale = yield* Schema.decodeEffect(LocaleSchema)("de-DE");

        const timezone =
          yield* Schema.decodeEffect(TimeZoneSchema)("Europe/Berlin");

        const baseCurrency =
          yield* Schema.decodeEffect(CurrencyCodeSchema)("EUR");

        const saved = yield* saveSettings.handler({
          baseCurrency,
          locale,
          primaryProfileId: primaryId,
          timezone,
        });

        expect(saved.setting?.locale).toBe("de-DE");
        expect(saved.setting?.timezone).toBe("Europe/Berlin");

        const reread = yield* readSetup.handler({});

        expect(reread.setting).toEqual(saved.setting);
      }).pipe(Effect.provide(demoD1SettingsLayer()))
  );

  it.effect("creates a new profile and refuses a duplicate name", () =>
    Effect.gen(function* testCreateAndDuplicate() {
      const name = yield* Schema.decodeEffect(ProfileNameSchema)("Demo Studio");

      const baseCurrency =
        yield* Schema.decodeEffect(CurrencyCodeSchema)("GBP");

      const created = yield* createProfile.handler({
        baseCurrency,
        kind: "business",
        name,
      });

      expect(created.name).toBe("Demo Studio");
      expect(created.baseCurrency).toBe("GBP");

      const duplicate = yield* createProfile
        .handler({
          baseCurrency,
          kind: "business",
          name,
        })
        .pipe(Effect.flip);

      expect(duplicate._tag).toBe("ProfileNameTaken");
    }).pipe(Effect.provide(demoD1SettingsLayer()))
  );

  it.effect("refuses saving settings for an unknown profile", () =>
    Effect.gen(function* testUnknownProfile() {
      const missingId =
        yield* Schema.decodeEffect(ProfileIdSchema)("profile-missing");

      const locale = yield* Schema.decodeEffect(LocaleSchema)("en-GB");

      const timezone =
        yield* Schema.decodeEffect(TimeZoneSchema)("Europe/London");

      const baseCurrency =
        yield* Schema.decodeEffect(CurrencyCodeSchema)("EUR");

      const error = yield* saveSettings
        .handler({
          baseCurrency,
          locale,
          primaryProfileId: missingId,
          timezone,
        })
        .pipe(Effect.flip);

      expect(error._tag).toBe("UnknownProfile");
    }).pipe(Effect.provide(demoD1SettingsLayer()))
  );
});
