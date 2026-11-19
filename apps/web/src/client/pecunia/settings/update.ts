import type { Setup } from "@pecunia/core/contracts";
import { Option, Result, Schema } from "effect";
import type { Update } from "foldkit";

import { ReadSetup, SaveSettings } from "./command.js";
import type { SettingsGateway } from "./gateway.js";
import { Message } from "./message.js";
import type { SettingsMessageValue } from "./message.js";
import {
  draftOf,
  editableSetupOf,
  incompleteSetup,
  parseDraft,
  Refusal,
  Save,
  SettingsScreen,
} from "./model.js";
import type {
  EditableSetupValue,
  SaveValue,
  SettingsDraftValue,
  SettingsRoleValue,
  SettingsScreenValue,
} from "./model.js";

export type SettingsUpdate = Update.Return<
  SettingsScreenValue,
  SettingsMessageValue,
  SettingsGateway
>;

const editing = (
  setup: EditableSetupValue,
  draft: SettingsDraftValue,
  save: SaveValue
): SettingsScreenValue => SettingsScreen.Editing({ draft, save, setup });

const loaded = (
  setup: Setup,
  role: SettingsRoleValue,
  save: SaveValue
): SettingsUpdate =>
  Option.match(editableSetupOf(setup), {
    onNone: () => ({
      model: SettingsScreen.Unavailable({ reason: incompleteSetup }),
    }),
    onSome: (editable) =>
      role === "viewer"
        ? { model: SettingsScreen.Viewing({ setup: editable }) }
        : { model: editing(editable, draftOf(editable), save) },
  });

const withDraft = (
  screen: SettingsScreenValue,
  change: (draft: SettingsDraftValue) => SettingsDraftValue
): SettingsUpdate =>
  SettingsScreen.match<SettingsUpdate>(screen, {
    Editing: ({ draft, save, setup }) =>
      Schema.is(Save.Saving)(save)
        ? { model: screen }
        : { model: editing(setup, change(draft), Save.Idle()) },
    Loading: () => ({ model: screen }),
    Unavailable: () => ({ model: screen }),
    Viewing: () => ({ model: screen }),
  });

const submit = (screen: SettingsScreenValue): SettingsUpdate =>
  SettingsScreen.match<SettingsUpdate>(screen, {
    Editing: ({ draft, save, setup }) => {
      if (Schema.is(Save.Saving)(save)) {
        return { model: screen };
      }

      const parsed = parseDraft(draft);

      if (Result.isFailure(parsed)) {
        return {
          model: editing(
            setup,
            draft,
            Save.Failed({ refusal: parsed.failure })
          ),
        };
      }

      return {
        commands: [
          SaveSettings({
            save: {
              ...parsed.success,
              primaryProfileId: setup.primary.id,
            },
          }),
        ],
        model: editing(setup, draft, Save.Saving()),
      };
    },
    Loading: () => ({ model: screen }),
    Unavailable: () => ({ model: screen }),
    Viewing: () => ({ model: screen }),
  });

export const open = (screen: SettingsScreenValue): SettingsUpdate =>
  Schema.is(SettingsScreen.Loading)(screen) ||
  Schema.is(SettingsScreen.Unavailable)(screen)
    ? { commands: [ReadSetup()], model: SettingsScreen.Loading() }
    : { model: screen };

export const update = (
  screen: SettingsScreenValue,
  role: SettingsRoleValue,
  message: SettingsMessageValue
): SettingsUpdate =>
  Message.match<SettingsUpdate>(message, {
    CompletedLoad: ({ setup }) => loaded(setup, role, Save.Idle()),
    CompletedSave: ({ setup }) =>
      SettingsScreen.match<SettingsUpdate>(screen, {
        Editing: () => loaded(setup, role, Save.Saved()),
        Loading: () => ({ model: screen }),
        Unavailable: () => ({ model: screen }),
        Viewing: () => ({ model: screen }),
      }),
    FailedLoad: ({ reason }) => ({
      model: SettingsScreen.Unavailable({ reason }),
    }),
    FailedSave: ({ reason }) =>
      SettingsScreen.match<SettingsUpdate>(screen, {
        Editing: ({ draft, setup }) => ({
          model: editing(
            setup,
            draft,
            Save.Failed({ refusal: Refusal.Service({ message: reason }) })
          ),
        }),
        Loading: () => ({ model: screen }),
        Unavailable: () => ({ model: screen }),
        Viewing: () => ({ model: screen }),
      }),
    Retried: () => open(screen),
    Submitted: () => submit(screen),
    TypedBaseCurrency: ({ value }) =>
      withDraft(screen, (draft) => ({ ...draft, baseCurrency: value })),
    TypedLocale: ({ value }) =>
      withDraft(screen, (draft) => ({ ...draft, locale: value })),
    TypedTimezone: ({ value }) =>
      withDraft(screen, (draft) => ({ ...draft, timezone: value })),
  });
