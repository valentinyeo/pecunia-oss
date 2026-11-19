import { Button, Input } from "@foldkit/ui";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/pecunia/settings/message.js";
import type { SettingsMessageValue } from "../../client/pecunia/settings/message.js";
import {
  fieldRefusal,
  listedProfiles,
  refusalReason,
  saveStatus,
  saving,
  SettingsScreen,
} from "../../client/pecunia/settings/model.js";
import type {
  EditableSetupValue,
  SaveValue,
  SettingsDraftValue,
  SettingsScreenValue,
} from "../../client/pecunia/settings/model.js";
import { styles } from "./pecunia.stylex.js";
import { settingsStyles } from "./settings.stylex.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

const field = (
  config: Readonly<{
    disabled: boolean;
    hint: string;
    id: string;
    invalid: boolean;
    label: string;
    onInput: (value: string) => SettingsMessageValue;
    value: string;
  }>,
  h: HtmlBuilder<SettingsMessageValue>
): Html =>
  Input.view(
    {
      hasDescription: true,
      id: config.id,
      isDisabled: config.disabled,
      isInvalid: config.invalid,
      name: config.id,
      onInput: config.onInput,
      toView: ({ description, input, label }) =>
        h.div(
          [h.Class(className(settingsStyles.field))],
          [
            h.label(
              [...label, h.Class(className(settingsStyles.fieldLabel))],
              [config.label]
            ),
            h.input([
              ...input,
              h.Class(
                stylex.props(
                  settingsStyles.fieldInput,
                  settingsStyles.focus,
                  config.invalid && settingsStyles.fieldInputInvalid
                ).className ?? ""
              ),
            ]),
            h.p(
              [...description, h.Class(className(settingsStyles.fieldHint))],
              [config.hint]
            ),
          ]
        ),
      type: "text",
      value: config.value,
    },
    h
  );

const summaryValues = (
  setup: EditableSetupValue,
  h: HtmlBuilder<SettingsMessageValue>
): Html =>
  h.dl(
    [h.Class(className(settingsStyles.valueList))],
    [
      h.div(
        [h.Key("base-currency")],
        [
          h.dt(
            [h.Class(className(settingsStyles.valueLabel))],
            ["Base currency"]
          ),
          h.dd(
            [
              h.Class(className(settingsStyles.valueText)),
              h.DataAttribute("saved", "base-currency"),
            ],
            [setup.primary.baseCurrency]
          ),
        ]
      ),
      h.div(
        [h.Key("language")],
        [
          h.dt([h.Class(className(settingsStyles.valueLabel))], ["Language"]),
          h.dd(
            [
              h.Class(className(settingsStyles.valueText)),
              h.DataAttribute("saved", "language"),
            ],
            [setup.setting.locale]
          ),
        ]
      ),
      h.div(
        [h.Key("timezone")],
        [
          h.dt([h.Class(className(settingsStyles.valueLabel))], ["Time zone"]),
          h.dd(
            [
              h.Class(className(settingsStyles.valueText)),
              h.DataAttribute("saved", "timezone"),
            ],
            [setup.setting.timezone]
          ),
        ]
      ),
    ]
  );

const profileSection = (
  setup: EditableSetupValue,
  h: HtmlBuilder<SettingsMessageValue>
): Html =>
  h.section(
    [h.AriaLabel("Profiles"), h.Class(className(styles.section))],
    [
      h.h2([h.Class(className(styles.sectionTitle))], ["Profiles"]),
      h.ul(
        [h.Class(className(settingsStyles.profileList))],
        listedProfiles(setup).map((profile) =>
          h.li(
            [h.Key(profile.id), h.Class(className(settingsStyles.profileRow))],
            [
              h.span(
                [h.Class(className(settingsStyles.profileName))],
                [profile.name]
              ),
              h.span([], [profile.kind]),
              h.span(
                [h.Class(className(settingsStyles.profileValue))],
                [profile.baseCurrency]
              ),
            ]
          )
        )
      ),
    ]
  );

const status = (save: SaveValue, h: HtmlBuilder<SettingsMessageValue>): Html =>
  h.p(
    [
      h.AriaLive("polite"),
      h.Class(className(settingsStyles.status)),
      h.Role(Option.isSome(refusalReason(save)) ? "alert" : "status"),
    ],
    [saveStatus(save)]
  );

const saveButton = (
  save: SaveValue,
  h: HtmlBuilder<SettingsMessageValue>
): Html =>
  Button.view(
    {
      isDisabled: saving(save),
      toView: ({ button }) =>
        h.button(
          [
            ...button,
            h.Class(
              stylex.props(
                settingsStyles.saveButton,
                settingsStyles.focus,
                saving(save) && settingsStyles.saveButtonDisabled
              ).className ?? ""
            ),
          ],
          ["Save settings"]
        ),
      type: "submit",
    },
    h
  );

const formFields = (
  draft: SettingsDraftValue,
  save: SaveValue,
  h: HtmlBuilder<SettingsMessageValue>
): readonly Html[] => [
  field(
    {
      disabled: saving(save),
      hint: "Three-letter code, for example GBP.",
      id: "settings-base-currency",
      invalid: Option.isSome(fieldRefusal(save, "baseCurrency")),
      label: "Base currency",
      onInput: (value: string) => Message.TypedBaseCurrency({ value }),
      value: draft.baseCurrency,
    },
    h
  ),
  field(
    {
      disabled: saving(save),
      hint: "A language tag, for example en-GB.",
      id: "settings-locale",
      invalid: Option.isSome(fieldRefusal(save, "locale")),
      label: "Language",
      onInput: (value: string) => Message.TypedLocale({ value }),
      value: draft.locale,
    },
    h
  ),
  field(
    {
      disabled: saving(save),
      hint: "An IANA time zone, for example Europe/London.",
      id: "settings-timezone",
      invalid: Option.isSome(fieldRefusal(save, "timezone")),
      label: "Time zone",
      onInput: (value: string) => Message.TypedTimezone({ value }),
      value: draft.timezone,
    },
    h
  ),
];

const editing = (
  draft: SettingsDraftValue,
  setup: EditableSetupValue,
  save: SaveValue,
  h: HtmlBuilder<SettingsMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.section))],
    [
      summaryValues(setup, h),
      h.form(
        [
          h.Class(className(settingsStyles.form)),
          h.OnSubmit(Message.Submitted()),
        ],
        [
          ...formFields(draft, save, h),
          h.div(
            [h.Class(className(settingsStyles.actions))],
            [saveButton(save, h), status(save, h)]
          ),
        ]
      ),
      profileSection(setup, h),
    ]
  );

const viewing = (
  setup: EditableSetupValue,
  h: HtmlBuilder<SettingsMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.section))],
    [
      h.p(
        [h.Class(className(styles.secondaryNote)), h.Role("note")],
        ["Read-only. Only an owner can change these settings."]
      ),
      summaryValues(setup, h),
      profileSection(setup, h),
    ]
  );

const unavailable = (
  reason: string,
  h: HtmlBuilder<SettingsMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.placeholder))],
    [
      h.p([h.Role("alert")], [reason]),
      Button.view(
        {
          onClick: Message.Retried(),
          toView: ({ button }) =>
            h.button(
              [
                ...button,
                h.Class(
                  stylex.props(settingsStyles.saveButton, settingsStyles.focus)
                    .className ?? ""
                ),
              ],
              ["Try again"]
            ),
          type: "button",
        },
        h
      ),
    ]
  );

export const view = Submodel.defineView<
  SettingsScreenValue,
  SettingsMessageValue
>((screen, h) =>
  h.section(
    [h.AriaLabel("Settings"), h.Class(className(styles.section))],
    [
      h.h1([h.Class(className(styles.pageTitle))], ["Settings"]),
      h.p(
        [h.Class(className(styles.secondaryNote)), h.Role("note")],
        [
          "Demo settings. Every value is made up, and the settings service runs in memory for this preview.",
        ]
      ),
      SettingsScreen.match<Html>(screen, {
        Editing: ({ draft, save, setup }) => editing(draft, setup, save, h),
        Loading: () => h.p([h.Role("status")], ["Loading settings…"]),
        Unavailable: ({ reason }) => unavailable(reason, h),
        Viewing: ({ setup }) => viewing(setup, h),
      }),
    ]
  )
);
