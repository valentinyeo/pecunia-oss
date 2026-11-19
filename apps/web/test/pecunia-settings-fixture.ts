import { SettingsSaveSchema, SetupSchema } from "@pecunia/core/contracts";
import type { SettingsSave, Setup } from "@pecunia/core/contracts";
import { Schema } from "effect";

export const demoSetup: Setup = Schema.decodeSync(SetupSchema)({
  profiles: [
    {
      baseCurrency: "GBP",
      id: "demo-business",
      kind: "business",
      name: "Example Ltd",
    },
    {
      baseCurrency: "EUR",
      id: "demo-personal",
      kind: "personal",
      name: "Demo Person",
    },
  ],
  setting: {
    locale: "en-GB",
    primaryProfileId: "demo-business",
    timezone: "Europe/London",
  },
});

export const primaryCurrencyOf = (setup: Setup): string | undefined =>
  setup.profiles.find(
    (profile) => profile.id === setup.setting?.primaryProfileId
  )?.baseCurrency;

export const savedInto = (setup: Setup, save: SettingsSave): Setup => ({
  profiles: setup.profiles.map((profile) =>
    profile.id === save.primaryProfileId
      ? { ...profile, baseCurrency: save.baseCurrency }
      : profile
  ),
  setting: {
    locale: save.locale,
    primaryProfileId: save.primaryProfileId,
    timezone: save.timezone,
  },
});

export const settingsSave = (
  save: Readonly<{
    baseCurrency?: string;
    locale?: string;
    primaryProfileId?: string;
    timezone?: string;
  }>
): SettingsSave =>
  Schema.decodeSync(SettingsSaveSchema)({
    baseCurrency: "GBP",
    locale: "en-GB",
    primaryProfileId: "demo-business",
    timezone: "Europe/London",
    ...save,
  });
