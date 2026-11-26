import {
  createProfileContract,
  readSetupContract,
  saveSettingsContract,
} from "@pecunia/core/settings";

export {
  AppSettingSchema,
  CurrencyCodeSchema,
  LocaleSchema,
  ProfileIdSchema,
  ProfileKindSchema,
  ProfileNameSchema,
  ProfileSchema,
  SetupSchema,
  TimeZoneSchema,
  createProfileContract,
  readSetupContract,
  saveSettingsContract,
} from "@pecunia/core/settings";

export type {
  AppSetting,
  CurrencyCode,
  Locale,
  Profile,
  ProfileId,
  ProfileKind,
  ProfileName,
  Setup,
  TimeZone,
} from "@pecunia/core/settings";

export const settingsContracts = [
  readSetupContract,
  saveSettingsContract,
  createProfileContract,
] as const;
