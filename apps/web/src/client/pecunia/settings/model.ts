import {
  AppSettingSchema,
  CurrencyCodeSchema,
  LocaleSchema,
  ProfileSchema,
  TimeZoneSchema,
} from "@pecunia/core/contracts";
import type {
  CurrencyCode,
  Locale,
  Profile,
  Setup,
  TimeZone,
} from "@pecunia/core/contracts";
import { Option, Result, Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

export const SettingsRole = Schema.Literals(["owner", "viewer"]);

export type SettingsRoleValue = typeof SettingsRole.Type;

export const SettingsField = Schema.Literals([
  "baseCurrency",
  "locale",
  "timezone",
]);

export type SettingsFieldValue = typeof SettingsField.Type;

export const SettingsDraft = Schema.Struct({
  baseCurrency: Schema.String,
  locale: Schema.String,
  timezone: Schema.String,
});

export type SettingsDraftValue = typeof SettingsDraft.Type;

export interface ParsedDraft {
  readonly baseCurrency: CurrencyCode;
  readonly locale: Locale;
  readonly timezone: TimeZone;
}

export const Refusal = defineTaggedUnion({
  Field: { field: SettingsField, message: Schema.NonEmptyString },
  Service: { message: Schema.NonEmptyString },
});

export type RefusalValue = typeof Refusal.Type;

export const Save = defineTaggedUnion({
  Failed: { refusal: Refusal },
  Idle: {},
  Saved: {},
  Saving: {},
});

export type SaveValue = typeof Save.Type;

const EditableSetup = Schema.Struct({
  others: Schema.Array(ProfileSchema),
  primary: ProfileSchema,
  setting: AppSettingSchema,
});

export type EditableSetupValue = typeof EditableSetup.Type;

export const SettingsScreen = defineTaggedUnion({
  Editing: { draft: SettingsDraft, save: Save, setup: EditableSetup },
  Loading: {},
  Unavailable: { reason: Schema.NonEmptyString },
  Viewing: { setup: EditableSetup },
});

export type SettingsScreenValue = typeof SettingsScreen.Type;

export const initialSettings: SettingsScreenValue = SettingsScreen.Loading();

export const incompleteSetup =
  "This install has no settings to edit. Settings need a profile with a base currency. Fix: create a profile, then open Settings again.";

const refusalCopy: Readonly<Record<SettingsFieldValue, string>> = {
  baseCurrency: "Base currency: enter a current three-letter code such as GBP.",
  locale: "Language: enter a language tag such as en-GB.",
  timezone: "Time zone: enter an IANA time zone such as Europe/London.",
};

const parseField = <Output>(
  field: SettingsFieldValue,
  schema: Schema.Codec<Output, string>,
  value: string
): Result.Result<Output, RefusalValue> => {
  const decoded = Schema.decodeResult(schema)(value);

  return Result.isFailure(decoded)
    ? Result.fail(Refusal.Field({ field, message: refusalCopy[field] }))
    : Result.succeed(decoded.success);
};

export const parseDraft = (
  draft: SettingsDraftValue
): Result.Result<ParsedDraft, RefusalValue> => {
  const baseCurrency = parseField(
    "baseCurrency",
    CurrencyCodeSchema,
    draft.baseCurrency
  );

  if (Result.isFailure(baseCurrency)) {
    return Result.fail(baseCurrency.failure);
  }

  const locale = parseField("locale", LocaleSchema, draft.locale);

  if (Result.isFailure(locale)) {
    return Result.fail(locale.failure);
  }

  const timezone = parseField("timezone", TimeZoneSchema, draft.timezone);

  return Result.isFailure(timezone)
    ? Result.fail(timezone.failure)
    : Result.succeed({
        baseCurrency: baseCurrency.success,
        locale: locale.success,
        timezone: timezone.success,
      });
};

export const editableSetupOf = (
  setup: Setup
): Option.Option<EditableSetupValue> => {
  const { setting } = setup;

  if (setting === null) {
    return Option.none();
  }

  const primary = setup.profiles.find(
    (profile) => profile.id === setting.primaryProfileId
  );

  return primary === undefined
    ? Option.none()
    : Option.some({
        others: setup.profiles.filter((profile) => profile.id !== primary.id),
        primary,
        setting,
      });
};

export const listedProfiles = (
  setup: EditableSetupValue
): readonly Profile[] => [setup.primary, ...setup.others];

export const draftOf = (setup: EditableSetupValue): SettingsDraftValue => ({
  baseCurrency: setup.primary.baseCurrency,
  locale: setup.setting.locale,
  timezone: setup.setting.timezone,
});

export const shownBaseCurrency = (
  screen: SettingsScreenValue
): Option.Option<CurrencyCode> =>
  SettingsScreen.match(screen, {
    Editing: ({ setup }) => Option.some(setup.primary.baseCurrency),
    Loading: () => Option.none(),
    Unavailable: () => Option.none(),
    Viewing: ({ setup }) => Option.some(setup.primary.baseCurrency),
  });

export const refusalReason = (save: SaveValue): Option.Option<string> =>
  Save.match(save, {
    Failed: ({ refusal }) => Option.some(refusal.message),
    Idle: () => Option.none(),
    Saved: () => Option.none(),
    Saving: () => Option.none(),
  });

export const fieldRefusal = (
  save: SaveValue,
  field: SettingsFieldValue
): Option.Option<string> =>
  Save.match(save, {
    Failed: ({ refusal }) =>
      Refusal.match(refusal, {
        Field: ({ field: refused, message }) =>
          refused === field ? Option.some(message) : Option.none(),
        Service: () => Option.none(),
      }),
    Idle: () => Option.none(),
    Saved: () => Option.none(),
    Saving: () => Option.none(),
  });

export const saving = (save: SaveValue): boolean =>
  Save.match(save, {
    Failed: () => false,
    Idle: () => false,
    Saved: () => false,
    Saving: () => true,
  });

export const saveStatus = (save: SaveValue): string =>
  Save.match(save, {
    Failed: ({ refusal }) => refusal.message,
    Idle: () => "",
    Saved: () => "Saved.",
    Saving: () => "Saving…",
  });
