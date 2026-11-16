import { expect, it } from "@effect/vitest";
import {
  createProfileContract,
  CurrencyCodeSchema,
  DuplicateProfileId,
  LocaleSchema,
  ProfileSchema,
  saveSettingsContract,
  TimeZoneSchema,
} from "@pecunia/core/settings";
import type { NewProfile, Profile, SettingsSave } from "@pecunia/core/settings";
import { Cause, Effect, Exit, Predicate, Result, Schema } from "effect";

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

const knownCurrencies = Intl.supportedValuesOf("currency");

const drawCurrency = (random: () => number) =>
  knownCurrencies[
    Math.floor(random() * knownCurrencies.length) % knownCurrencies.length
  ] ?? "EUR";

it.effect(
  "every currency the platform lists is accepted and invented codes are refused, over 500 seeded draws",
  () =>
    Effect.sync(() => {
      const random = seededRandom(20_260_104);

      for (let index = 0; index < SEEDED_CASES; index += 1) {
        const code = drawCurrency(random);

        expect(
          Result.isSuccess(Schema.decodeResult(CurrencyCodeSchema)(code))
        ).toBe(true);

        const distorted = pick(
          [
            code.toLowerCase(),
            `${code}A`,
            code.slice(0, 2),
            `${code.slice(0, 2)}1`,
            ` ${code}`,
            "ZZZ",
          ] as const,
          random
        );

        expect(
          Result.isFailure(Schema.decodeResult(CurrencyCodeSchema)(distorted))
        ).toBe(true);
      }
    })
);

it.effect(
  "accepts the codes a new install picks and refuses invented ones",
  () =>
    Effect.sync(() => {
      for (const code of ["EUR", "GBP", "USD"]) {
        expect(
          Result.isSuccess(Schema.decodeResult(CurrencyCodeSchema)(code))
        ).toBe(true);
      }

      expect(
        Result.isFailure(Schema.decodeResult(CurrencyCodeSchema)("ZZZ"))
      ).toBe(true);

      for (const tag of ["en-GB", "de-DE"]) {
        expect(Result.isSuccess(Schema.decodeResult(LocaleSchema)(tag))).toBe(
          true
        );
      }

      expect(Result.isFailure(Schema.decodeResult(LocaleSchema)("xx-ZZ"))).toBe(
        true
      );
    })
);

const LOCALES = ["en", "en-GB", "pt-BR", "zh-Hant", "es-419", "de-CH"] as const;

const NOT_LOCALES = [
  "EN-gb",
  "english",
  "e",
  "en-GB-extra",
  "en_gb",
  "xx-ZZ",
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
        "Europe/Berlin",
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

const PROFILE_CASES = 600;

const SEED_ID_POOL = [
  "profile-1",
  "profile-2",
  "profile-3",
  "profile-10",
  "demo",
  "0192f0c1-0002-7f50-85ff-5ffb4c3ef459",
] as const;

const SEED_CURRENCIES = ["EUR", "GBP", "USD", "JPY", "CHF"] as const;

const SEED_KINDS = ["business", "personal"] as const;

interface ProfileCase {
  readonly createdNames: readonly string[];
  readonly seed: readonly Profile[];
  readonly targetIndex: number;
}

const uniqueSeedId = (
  random: () => number,
  used: Set<string>,
  hint: number
): string => {
  const base = pick(SEED_ID_POOL, random);
  let candidate: string = base;
  let suffix = hint;

  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  used.add(candidate);

  return candidate;
};

const profileCases = (): readonly ProfileCase[] => {
  const random = seededRandom(20_260_107);

  return Array.from({ length: PROFILE_CASES }, (unusedCase, caseIndex) => {
    const used = new Set<string>();
    const seedCount = Math.floor(random() * 9);

    const seed = Array.from({ length: seedCount }, (unusedSlot, seedIndex) =>
      Schema.decodeSync(ProfileSchema)({
        baseCurrency: pick(SEED_CURRENCIES, random),
        id: uniqueSeedId(random, used, seedIndex),
        kind: pick(SEED_KINDS, random),
        name: `Seed ${caseIndex}-${seedIndex}`,
      })
    );

    const createCount = 1 + Math.floor(random() * 4);

    return {
      createdNames: Array.from(
        { length: createCount },
        (unusedCreated, createIndex) => `Added ${caseIndex}-${createIndex}`
      ),
      seed,
      targetIndex: Math.floor(random() * createCount) % createCount,
    };
  });
};

it.effect(
  "creating profiles after any seed keeps every id unique and a save touches one profile, over 600 seeded draws",
  () =>
    Effect.forEach(
      profileCases(),
      (oneCase) =>
        Effect.gen(function* keepIdsUnique() {
          const before = yield* readSetup.handler({});

          const created = yield* Effect.forEach(
            oneCase.createdNames,
            (name) => createProfile.handler(profile(name)),
            { concurrency: 1 }
          );

          const afterCreate = yield* readSetup.handler({});
          const ids = afterCreate.profiles.map((stored) => stored.id);

          expect(new Set(ids).size).toBe(ids.length);
          expect(afterCreate.profiles).toHaveLength(
            before.profiles.length + created.length
          );
          expect(new Set(created.map((stored) => stored.id)).size).toBe(
            created.length
          );

          const target = created[oneCase.targetIndex];

          if (target === undefined) {
            throw new Error("the profile case created no profile to save");
          }

          yield* saveSettings.handler(settingsFor(target.id, "KWD"));

          const afterSave = yield* readSetup.handler({});

          const savedCurrencies = afterSave.profiles.map(
            (stored) => stored.baseCurrency
          );

          const expectedCurrencies = afterCreate.profiles.map((stored) =>
            stored.id === target.id ? "KWD" : stored.baseCurrency
          );

          expect(savedCurrencies).toEqual(expectedCurrencies);
          expect(
            afterSave.profiles.filter((stored) => stored.baseCurrency === "KWD")
          ).toHaveLength(1);
          expect(afterSave.setting?.primaryProfileId).toBe(target.id);
        }).pipe(
          Effect.provide(
            memorySettingsLayer({ profiles: oneCase.seed, setting: undefined })
          )
        ),
      { concurrency: 1 }
    )
);

it.effect("a seed with a repeated profile id is refused by name", () =>
  Effect.gen(function* refuseRepeatedSeedId() {
    const first = yield* Schema.decodeEffect(ProfileSchema)({
      baseCurrency: "EUR",
      id: "profile-2",
      kind: "business",
      name: "Example Ltd",
    });

    const second = yield* Schema.decodeEffect(ProfileSchema)({
      baseCurrency: "GBP",
      id: "profile-2",
      kind: "personal",
      name: "Demo Person",
    });

    const exit = yield* readSetup
      .handler({})
      .pipe(
        Effect.provide(
          memorySettingsLayer({ profiles: [first, second], setting: undefined })
        ),
        Effect.exit
      );

    const defect = Exit.isFailure(exit)
      ? Result.getOrThrow(Cause.findDefect(exit.cause))
      : undefined;

    expect(Predicate.isTagged(defect, "DuplicateProfileId")).toBe(true);
    expect(
      Schema.is(DuplicateProfileId)(defect) ? defect.profileId : undefined
    ).toBe("profile-2");
  })
);
