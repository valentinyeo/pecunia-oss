import { defineContract } from "@pecunia/capability/contract";
import { Schema } from "effect";

import { ProfileNameTaken } from "./profile-name-taken.js";
import { SettingsUnavailable } from "./settings-unavailable.js";
import { UnknownProfile } from "./unknown-profile.js";

export { DuplicateProfileId } from "./duplicate-profile-id.js";

export { ProfileNameTaken } from "./profile-name-taken.js";

export { SettingsUnavailable } from "./settings-unavailable.js";

export { UnknownProfile } from "./unknown-profile.js";

const knownCurrencies = new Set(Intl.supportedValuesOf("currency"));

const isKnownCurrency = (value: string) => knownCurrencies.has(value);

export const CurrencyCodeSchema = Schema.String.check(
  Schema.isPattern(/^[A-Z]{3}$/u),
  Schema.makeFilter(isKnownCurrency, {
    expected: "a current ISO 4217 currency code, such as EUR or GBP",
  })
).pipe(Schema.brand("CurrencyCode"));

export type CurrencyCode = typeof CurrencyCodeSchema.Type;

export const ProfileIdSchema = Schema.NonEmptyString.pipe(
  Schema.brand("ProfileId")
);

export type ProfileId = typeof ProfileIdSchema.Type;

const isTimeZoneName = (value: string) => {
  try {
    const format = new Intl.DateTimeFormat("en-GB", { timeZone: value });

    return format.resolvedOptions().timeZone.length > 0;
  } catch {
    return false;
  }
};

export const TimeZoneSchema = Schema.String.check(
  Schema.isPattern(/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/u),
  Schema.makeFilter(isTimeZoneName, {
    expected: "an IANA time zone name, such as Europe/London",
  })
).pipe(Schema.brand("TimeZone"));

export type TimeZone = typeof TimeZoneSchema.Type;

const languageOf = (tag: string) => tag.split("-").at(0) ?? "";

const isKnownLocale = (value: string) => {
  try {
    const canonical = Intl.getCanonicalLocales(value).at(0);

    if (canonical === undefined) {
      return false;
    }

    const resolved = new Intl.DateTimeFormat(canonical).resolvedOptions()
      .locale;

    return languageOf(resolved) === languageOf(canonical);
  } catch {
    return false;
  }
};

export const LocaleSchema = Schema.String.check(
  Schema.isPattern(
    /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|[0-9]{3}))?$/u
  ),
  Schema.makeFilter(isKnownLocale, {
    expected: "a language tag the platform knows, such as en-GB or de-DE",
  })
).pipe(Schema.brand("Locale"));

export type Locale = typeof LocaleSchema.Type;

const isProfileName = (value: string) => {
  const trimmed = value.trim();

  if (trimmed !== value) {
    return "the name has no leading or trailing spaces";
  }

  if (trimmed.length === 0) {
    return "the name is not blank";
  }

  if (trimmed.length > 80) {
    return "the name is at most 80 characters";
  }

  return /\p{Cc}/u.test(value) ? "the name has no control characters" : true;
};

export const ProfileNameSchema = Schema.String.check(
  Schema.makeFilter(isProfileName, {
    expected: "a profile name of 1 to 80 printable characters",
  })
);

export type ProfileName = typeof ProfileNameSchema.Type;

export const ProfileKindSchema = Schema.Literals(["business", "personal"]);

export type ProfileKind = typeof ProfileKindSchema.Type;

export const ProfileSchema = Schema.Struct({
  baseCurrency: CurrencyCodeSchema,
  id: ProfileIdSchema,
  kind: ProfileKindSchema,
  name: ProfileNameSchema,
});

export type Profile = typeof ProfileSchema.Type;

export const AppSettingSchema = Schema.Struct({
  locale: LocaleSchema,
  primaryProfileId: ProfileIdSchema,
  timezone: TimeZoneSchema,
});

export type AppSetting = typeof AppSettingSchema.Type;

export const SettingsSaveSchema = Schema.Struct({
  ...AppSettingSchema.fields,
  baseCurrency: CurrencyCodeSchema,
});

export type SettingsSave = typeof SettingsSaveSchema.Type;

export const SetupSchema = Schema.Struct({
  profiles: Schema.Array(ProfileSchema),
  setting: Schema.NullOr(AppSettingSchema),
});

export type Setup = typeof SetupSchema.Type;

export const NewProfileSchema = Schema.Struct({
  baseCurrency: CurrencyCodeSchema,
  kind: ProfileKindSchema,
  name: ProfileNameSchema,
});

export type NewProfile = typeof NewProfileSchema.Type;

export const readSetupContract = defineContract("readSetup", {
  annotations: { idempotent: true, readOnly: true },
  description:
    "Read the saved currency, language, and time zone, with the profiles a new install can choose between.",
  failure: SettingsUnavailable,
  input: Schema.Struct({}),
  output: SetupSchema,
});

export const saveSettingsContract = defineContract("saveSettings", {
  annotations: { idempotent: true },
  description:
    "Save the language and time zone, and set the base currency on the primary profile.",
  failure: Schema.Union([UnknownProfile, SettingsUnavailable]),
  input: SettingsSaveSchema,
  output: SetupSchema,
});

export const createProfileContract = defineContract("createProfile", {
  annotations: { idempotent: false },
  description:
    "Create a profile with its own base currency so a new install starts without code changes.",
  failure: Schema.Union([ProfileNameTaken, SettingsUnavailable]),
  input: NewProfileSchema,
  output: ProfileSchema,
});
