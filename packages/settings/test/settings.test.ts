import { expect, it } from "@effect/vitest";
import {
  createProfileContract,
  CurrencyCodeSchema,
  LocaleSchema,
  saveSettingsContract,
  TimeZoneSchema,
} from "@pecunia/core/settings";
import type { NewProfile, SettingsSave } from "@pecunia/core/settings";
import { Effect, Predicate, Result, Schema } from "effect";

import { createProfile, readSetup, saveSettings } from "../src/capabilities.js";
import { memorySettingsLayer } from "../src/settings-memory.js";

const profile = (name: string): NewProfile =>
  Schema.decodeSync(createProfileContract.input)({
    baseCurrency: "EUR",
    kind: "business",
    name,
  });

const settingsFor = (
  primaryProfileId: string,
  baseCurrency = "EUR"
): SettingsSave =>
  Schema.decodeSync(saveSettingsContract.input)({
    baseCurrency,
    locale: "en-GB",
    primaryProfileId,
    timezone: "Europe/London",
  });

const failureOf = (outcome: Result.Result<unknown, unknown>) =>
  Result.isFailure(outcome) ? outcome.failure : undefined;

it.effect(
  "a new install creates a profile, saves settings, and reads them back",
  () =>
    Effect.gen(function* setUpFreshInstall() {
      const created = yield* createProfile.handler(profile("Example Ltd"));

      const saved = yield* saveSettings.handler(settingsFor(created.id, "GBP"));

      expect(saved.setting).toEqual({
        locale: "en-GB",
        primaryProfileId: created.id,
        timezone: "Europe/London",
      });
      expect(saved.profiles).toEqual([
        {
          baseCurrency: "GBP",
          id: created.id,
          kind: "business",
          name: "Example Ltd",
        },
      ]);

      const setup = yield* readSetup.handler({});

      expect(setup).toEqual(saved);
    }).pipe(Effect.provide(memorySettingsLayer()))
);

it.effect("a first run reads back no profiles and no setting", () =>
  Effect.gen(function* readEmptySetup() {
    const setup = yield* readSetup.handler({});

    expect(setup).toEqual({ profiles: [], setting: null });
  }).pipe(Effect.provide(memorySettingsLayer()))
);

it.effect("two profiles keep their own base currency", () =>
  Effect.gen(function* keepTwoCurrencies() {
    const business = yield* createProfile.handler(profile("Example Ltd"));
    const personal = yield* createProfile.handler(profile("Demo Person"));

    yield* saveSettings.handler(settingsFor(business.id, "GBP"));
    yield* saveSettings.handler(settingsFor(personal.id, "JPY"));

    const setup = yield* readSetup.handler({});

    expect(setup.profiles.map((stored) => stored.baseCurrency)).toEqual([
      "GBP",
      "JPY",
    ]);
    expect(setup.setting?.primaryProfileId).toBe(personal.id);
  }).pipe(Effect.provide(memorySettingsLayer()))
);

it.effect("saving settings for an unknown profile is refused by name", () =>
  Effect.gen(function* refuseUnknownProfile() {
    const outcome = yield* saveSettings
      .handler(settingsFor("0192f0c1-0002-7f50-85ff-5ffb4c3ef459"))
      .pipe(Effect.result);

    expect(Predicate.isTagged(failureOf(outcome), "UnknownProfile")).toBe(true);
  }).pipe(Effect.provide(memorySettingsLayer()))
);

it.effect("a second profile with the same name is refused by name", () =>
  Effect.gen(function* refuseDuplicateName() {
    yield* createProfile.handler(profile("Example Ltd"));

    const outcome = yield* createProfile
      .handler(profile("Example Ltd"))
      .pipe(Effect.result);

    expect(Predicate.isTagged(failureOf(outcome), "ProfileNameTaken")).toBe(
      true
    );
  }).pipe(Effect.provide(memorySettingsLayer()))
);

it.effect("a saved setting keeps the currency the profile was given", () =>
  Effect.gen(function* keepCurrency() {
    const created = yield* createProfile.handler(profile("Example Ltd"));

    const saved = yield* saveSettings.handler(settingsFor(created.id));

    expect(saved.profiles.at(0)?.baseCurrency).toBe("EUR");
  }).pipe(Effect.provide(memorySettingsLayer()))
);

const SEEDED_CASES = 500;

const seededRandom = (seed: number) => {
  let state = seed % 2_147_483_647;

  if (state <= 0) {
    state += 2_147_483_646;
  }

  return () => {
    state = (state * 16_807) % 2_147_483_647;

    return (state - 1) / 2_147_483_646;
  };
};

const pick = <Value>(
  values: readonly [Value, ...Value[]],
  random: () => number
) => values[Math.floor(random() * values.length) % values.length] ?? values[0];

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const threeUppercaseLetters = (random: () => number): string =>
  Array.from({ length: 3 }, () => {
    const index = Math.floor(random() * alphabet.length) % alphabet.length;

    return alphabet.charAt(index);
  }).join("");

it.effect(
  "every three uppercase letters is a currency code, over 500 seeded draws",
  () =>
    Effect.sync(() => {
      const random = seededRandom(20_260_104);

      for (let index = 0; index < SEEDED_CASES; index += 1) {
        const code = threeUppercaseLetters(random);
        const decoded = Schema.decodeResult(CurrencyCodeSchema)(code);

        expect(Result.isSuccess(decoded)).toBe(true);

        const distorted = pick(
          [
            code.toLowerCase(),
            `${code}A`,
            code.slice(0, 2),
            `${code.slice(0, 2)}1`,
            ` ${code}`,
          ] as const,
          random
        );

        expect(
          Result.isFailure(Schema.decodeResult(CurrencyCodeSchema)(distorted))
        ).toBe(true);
      }
    })
);

const LOCALES = ["en", "en-GB", "pt-BR", "zh-Hant", "es-419", "de-CH"] as const;

const NOT_LOCALES = [
  "EN-gb",
  "english",
  "e",
  "en-GB-extra",
  "en_gb",
  "",
] as const;

it.effect(
  "accepts a language tag and refuses the near misses, over 500 seeded draws",
  () =>
    Effect.sync(() => {
      const random = seededRandom(20_260_105);

      for (let index = 0; index < SEEDED_CASES; index += 1) {
        expect(
          Result.isSuccess(
            Schema.decodeResult(LocaleSchema)(pick(LOCALES, random))
          )
        ).toBe(true);
        expect(
          Result.isFailure(
            Schema.decodeResult(LocaleSchema)(pick(NOT_LOCALES, random))
          )
        ).toBe(true);
      }
    })
);

it.effect(
  "accepts IANA time zones and refuses invented ones, over 500 seeded draws",
  () =>
    Effect.sync(() => {
      const random = seededRandom(20_260_106);

      const zones = [
        "Europe/London",
        "UTC",
        "America/New_York",
        "Asia/Tokyo",
        "Australia/Sydney",
      ] as const;

      const invented = [
        "Mars/Olympus",
        "Europe/Atlantis",
        "Olympus",
        "",
      ] as const;

      for (let index = 0; index < SEEDED_CASES; index += 1) {
        expect(
          Result.isSuccess(
            Schema.decodeResult(TimeZoneSchema)(pick(zones, random))
          )
        ).toBe(true);
        expect(
          Result.isFailure(
            Schema.decodeResult(TimeZoneSchema)(pick(invented, random))
          )
        ).toBe(true);
      }
    })
);
