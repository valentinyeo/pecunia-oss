import { Command, Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { ProfileKindSchema } from "@pecunia/settings/contracts";
import { Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import {
  CreateProfileCommand,
  ReadSetupQuery,
  SaveSettingsCommand,
} from "../../client/pecunia-ui/queries.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

export const SettingsMessage = UiSchema.TaggedEnum({
  FailedAction: { message: Schema.String },
  IgnoredSetup: {},
  LoadedSetup: {
    baseCurrency: Schema.String,
    locale: Schema.String,
    primaryProfileId: Schema.String,
    timezone: Schema.String,
  },
  SubmittedCreateProfile: {},
  SubmittedSettings: {},
  SucceededCreateProfile: { name: Schema.String },
  SucceededSaveSettings: {},
  UpdatedBaseCurrency: { value: Schema.String },
  UpdatedLocale: { value: Schema.String },
  UpdatedNewProfileCurrency: { value: Schema.String },
  UpdatedNewProfileKind: { value: ProfileKindSchema },
  UpdatedNewProfileName: { value: Schema.String },
  UpdatedPrimaryProfile: { value: Schema.String },
  UpdatedTimezone: { value: Schema.String },
});

export const SettingsPage = Html.component({
  message: SettingsMessage,
  model: Schema.Struct({
    baseCurrency: Schema.String,
    feedback: Schema.NullOr(Schema.String),
    hydrated: Schema.Boolean,
    locale: Schema.String,
    newProfileCurrency: Schema.String,
    newProfileKind: ProfileKindSchema,
    newProfileName: Schema.String,
    primaryProfileId: Schema.String,
    timezone: Schema.String,
  }),
  name: "SettingsPage",
  queries: {
    setup: {
      args: () => ({}),
      onChange: (result) =>
        AsyncResult.isSuccess(result) && result.value.setting !== null
          ? SettingsMessage.LoadedSetup({
              baseCurrency:
                result.value.profiles.find(
                  (profile) =>
                    profile.id === result.value.setting?.primaryProfileId
                )?.baseCurrency ??
                result.value.profiles[0]?.baseCurrency ??
                "EUR",
              locale: result.value.setting.locale,
              primaryProfileId: result.value.setting.primaryProfileId,
              timezone: result.value.setting.timezone,
            })
          : SettingsMessage.IgnoredSetup(),
      query: ReadSetupQuery,
    },
  },
}).make({
  head: () => [Head.title("Settings")],
  init: () => ({
    baseCurrency: "EUR",
    feedback: null,
    hydrated: false,
    locale: "en-GB",
    newProfileCurrency: "EUR",
    newProfileKind: "personal",
    newProfileName: "",
    primaryProfileId: "",
    timezone: "Europe/London",
  }),
  update: ($, message) =>
    SettingsMessage.match(message, {
      FailedAction: ({ message: text }) => $.evolve({ feedback: text }),
      IgnoredSetup: () => $.model,
      LoadedSetup: ({ baseCurrency, locale, primaryProfileId, timezone }) =>
        $.model.hydrated
          ? $.model
          : $.evolve({
              baseCurrency,
              hydrated: true,
              locale,
              primaryProfileId,
              timezone,
            }),
      SubmittedCreateProfile: () =>
        $.evolve({ feedback: null }).run(
          CreateProfileCommand.make({
            baseCurrency: $.model.newProfileCurrency.trim().toUpperCase(),
            kind: $.model.newProfileKind,
            name: $.model.newProfileName.trim(),
          }).pipe(
            Command.match({
              onFailure: (error) =>
                SettingsMessage.FailedAction({ message: error.message }),
              onSuccess: (created) =>
                SettingsMessage.SucceededCreateProfile({ name: created.name }),
            })
          )
        ),
      SubmittedSettings: () =>
        $.evolve({ feedback: null }).run(
          SaveSettingsCommand.make({
            baseCurrency: $.model.baseCurrency.trim().toUpperCase(),
            locale: $.model.locale.trim(),
            primaryProfileId: $.model.primaryProfileId,
            timezone: $.model.timezone.trim(),
          }).pipe(
            Command.match({
              onFailure: (error) =>
                SettingsMessage.FailedAction({ message: error.message }),
              onSuccess: () => SettingsMessage.SucceededSaveSettings(),
            })
          )
        ),
      SucceededCreateProfile: ({ name }) =>
        $.evolve({
          feedback: `Created profile ${name} in D1.`,
          newProfileName: "",
        }),
      SucceededSaveSettings: () =>
        $.evolve({ feedback: "Settings saved to D1." }),
      UpdatedBaseCurrency: ({ value }) => $.evolve({ baseCurrency: value }),
      UpdatedLocale: ({ value }) => $.evolve({ locale: value }),
      UpdatedNewProfileCurrency: ({ value }) =>
        $.evolve({ newProfileCurrency: value }),
      UpdatedNewProfileKind: ({ value }) => $.evolve({ newProfileKind: value }),
      UpdatedNewProfileName: ({ value }) => $.evolve({ newProfileName: value }),
      UpdatedPrimaryProfile: ({ value }) =>
        $.evolve({ primaryProfileId: value }),
      UpdatedTimezone: ({ value }) => $.evolve({ timezone: value }),
    }),
  view: (h, model) =>
    h.section
      .attr("aria-label", "Settings")
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.h1.class(sx(styles.pageTitle)).children("Settings"),
        model.feedback === null
          ? null
          : h.p
              .attr("role", "status")
              .class(sx(pecuniaUiStyles.feedback))
              .children(model.feedback),
        AsyncResult.match(h.queries.setup, {
          onFailure: ({ cause }) =>
            h.p
              .attr("role", "alert")
              .class(sx(pecuniaUiStyles.feedback))
              .children(`Could not load setup: ${String(cause)}`),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading settings from /app/rpc…"),
          onSuccess: ({ value: setup }) => {
            const activePrimary =
              model.primaryProfileId.length > 0
                ? model.primaryProfileId
                : (setup.setting?.primaryProfileId ??
                  setup.profiles[0]?.id ??
                  "");

            const activeLocale = model.hydrated
              ? model.locale
              : (setup.setting?.locale ?? model.locale);

            const activeTimezone = model.hydrated
              ? model.timezone
              : (setup.setting?.timezone ?? model.timezone);

            const activeCurrency = model.hydrated
              ? model.baseCurrency
              : (setup.profiles.find((p) => p.id === activePrimary)
                  ?.baseCurrency ?? model.baseCurrency);

            return h.div.class(sx(pecuniaUiStyles.stack)).children(
              h.form
                .class(sx(styles.card))
                .on("submit", SettingsMessage.SubmittedSettings())
                .children(
                  h.h2
                    .class(sx(styles.sectionTitle))
                    .children("Installation defaults"),
                  h.div.class(sx(pecuniaUiStyles.formGrid)).children(
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Locale"),
                      h.input
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(activeLocale)
                        .on("input", ({ value }) =>
                          SettingsMessage.UpdatedLocale({ value })
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Time zone"),
                      h.input
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(activeTimezone)
                        .on("input", ({ value }) =>
                          SettingsMessage.UpdatedTimezone({ value })
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Base currency"),
                      h.input
                        .attr("type", "text")
                        .class(sx(pecuniaUiStyles.input))
                        .value(activeCurrency)
                        .on("input", ({ value }) =>
                          SettingsMessage.UpdatedBaseCurrency({ value })
                        )
                    ),
                    h.label.class(sx(pecuniaUiStyles.field)).children(
                      h.span
                        .class(sx(pecuniaUiStyles.fieldLabel))
                        .children("Primary profile"),
                      h.select
                        .class(sx(pecuniaUiStyles.input))
                        .value(activePrimary)
                        .on("change", ({ value }) =>
                          SettingsMessage.UpdatedPrimaryProfile({ value })
                        )
                        .children(
                          setup.profiles.map((profile) =>
                            h.option
                              .key(profile.id)
                              .attr("value", profile.id)
                              .children(
                                `${profile.name} (${profile.baseCurrency})`
                              )
                          )
                        )
                    )
                  ),
                  h.button
                    .attr("type", "submit")
                    .class(
                      sx(pecuniaUiStyles.button, pecuniaUiStyles.buttonPrimary)
                    )
                    .children("Save settings")
                ),
              h.div.class(sx(styles.card)).children(
                h.h2.class(sx(styles.sectionTitle)).children("Profiles"),
                h.ul.class(sx(styles.accountList)).children(
                  setup.profiles.map((profile) =>
                    h.li
                      .key(profile.id)
                      .class(sx(styles.accountRow))
                      .children(
                        h.span
                          .class(sx(styles.accountName))
                          .children(profile.name),
                        h.span
                          .class(sx(pecuniaUiStyles.badge))
                          .children(`${profile.kind} · ${profile.baseCurrency}`)
                      )
                  )
                ),
                h.form
                  .on("submit", SettingsMessage.SubmittedCreateProfile())
                  .children(
                    h.div.class(sx(pecuniaUiStyles.formGrid)).children(
                      h.label.class(sx(pecuniaUiStyles.field)).children(
                        h.span
                          .class(sx(pecuniaUiStyles.fieldLabel))
                          .children("New profile name"),
                        h.input
                          .attr("placeholder", "Demo Studio")
                          .attr("type", "text")
                          .class(sx(pecuniaUiStyles.input))
                          .value(model.newProfileName)
                          .on("input", ({ value }) =>
                            SettingsMessage.UpdatedNewProfileName({ value })
                          )
                      ),
                      h.label.class(sx(pecuniaUiStyles.field)).children(
                        h.span
                          .class(sx(pecuniaUiStyles.fieldLabel))
                          .children("Kind"),
                        h.select
                          .class(sx(pecuniaUiStyles.input))
                          .value(model.newProfileKind)
                          .on("change", ({ value }) =>
                            SettingsMessage.UpdatedNewProfileKind({
                              value:
                                value === "business" ? "business" : "personal",
                            })
                          )
                          .children(
                            h.option
                              .attr("value", "personal")
                              .children("Personal"),
                            h.option
                              .attr("value", "business")
                              .children("Business")
                          )
                      ),
                      h.label.class(sx(pecuniaUiStyles.field)).children(
                        h.span
                          .class(sx(pecuniaUiStyles.fieldLabel))
                          .children("Currency"),
                        h.input
                          .attr("type", "text")
                          .class(sx(pecuniaUiStyles.input))
                          .value(model.newProfileCurrency)
                          .on("input", ({ value }) =>
                            SettingsMessage.UpdatedNewProfileCurrency({ value })
                          )
                      )
                    ),
                    h.button
                      .attr("type", "submit")
                      .class(sx(pecuniaUiStyles.button))
                      .children("Create profile")
                  )
              )
            );
          },
        })
      ),
});
