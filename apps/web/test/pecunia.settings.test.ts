import { describe, expect, it } from "@effect/vitest";
import { SetupSchema } from "@pecunia/core/contracts";
import { Effect, Option, Result, Schema } from "effect";

import { SaveSettings } from "../src/client/pecunia/settings/command.js";
import { SettingsGateway } from "../src/client/pecunia/settings/gateway.js";
import { Message as SettingsMessage } from "../src/client/pecunia/settings/message.js";
import type { SettingsMessageValue } from "../src/client/pecunia/settings/message.js";
import {
  initialSettings,
  parseDraft,
  refusalReason,
  SettingsScreen,
  shownBaseCurrency,
} from "../src/client/pecunia/settings/model.js";
import type {
  SettingsDraftValue,
  SettingsRoleValue,
  SettingsScreenValue,
} from "../src/client/pecunia/settings/model.js";
import {
  open as openSettings,
  update as updateSettings,
} from "../src/client/pecunia/settings/update.js";
import {
  demoSetup,
  savedInto,
  settingsSave,
} from "./pecunia-settings-fixture.js";

const send = (
  screen: SettingsScreenValue,
  message: SettingsMessageValue,
  role: SettingsRoleValue = "owner"
) => updateSettings(screen, role, message);

const loaded = (role: SettingsRoleValue = "owner"): SettingsScreenValue =>
  send(
    initialSettings,
    SettingsMessage.CompletedLoad({ setup: demoSetup }),
    role
  ).model;

const editing = (role: SettingsRoleValue = "owner") => {
  const screen = loaded(role);

  if (Schema.is(SettingsScreen.Editing)(screen)) {
    return screen;
  }

  throw new Error("the demo setup opens the editor for an owner");
};

const typed = (
  screen: SettingsScreenValue,
  message: SettingsMessageValue
): SettingsScreenValue => send(screen, message).model;

const typedCurrency = (
  screen: SettingsScreenValue,
  value: string
): SettingsScreenValue =>
  typed(screen, SettingsMessage.TypedBaseCurrency({ value }));

const refusal = (screen: SettingsScreenValue): string =>
  SettingsScreen.match(screen, {
    Editing: ({ save }) => Option.getOrElse(refusalReason(save), () => ""),
    Loading: () => "",
    Unavailable: () => "",
    Viewing: () => "",
  });

const saveTag = (screen: SettingsScreenValue): string =>
  SettingsScreen.guards.Editing(screen) ? screen.save._tag : "None";

const draftOf = (screen: SettingsScreenValue): SettingsDraftValue | undefined =>
  Schema.is(SettingsScreen.Editing)(screen) ? screen.draft : undefined;

const shown = (screen: SettingsScreenValue): string | undefined =>
  Option.getOrUndefined(shownBaseCurrency(screen));

describe("settings screen state", () => {
  it("opening settings asks the settings service for the saved setup", () => {
    const opened = openSettings(initialSettings);

    expect(opened.model).toStrictEqual(initialSettings);
    expect(opened.commands).toHaveLength(1);
    expect(opened.commands?.[0]).toMatchObject({ name: "ReadSetup" });
  });

  it("opening settings again keeps the values already loaded", () => {
    const screen = editing();
    const reopened = openSettings(screen);

    expect(reopened.model).toStrictEqual(screen);
    expect(reopened.commands).toBeUndefined();
  });

  it("an owner sees the saved values in the draft and the summary", () => {
    const screen = editing();

    expect(draftOf(screen)).toStrictEqual({
      baseCurrency: "GBP",
      locale: "en-GB",
      timezone: "Europe/London",
    });
    expect(shown(screen)).toBe("GBP");
  });

  it("a viewer sees the values without a draft to save", () => {
    const screen = loaded("viewer");

    expect(SettingsScreen.guards.Viewing(screen)).toBe(true);
    expect(shown(screen)).toBe("GBP");
    expect(draftOf(screen)).toBeUndefined();
  });

  it("typing the base currency changes the draft and nothing saved", () => {
    const screen = typedCurrency(editing(), "EUR");

    expect(draftOf(screen)).toStrictEqual({
      baseCurrency: "EUR",
      locale: "en-GB",
      timezone: "Europe/London",
    });
    expect(shown(screen)).toBe("GBP");
  });

  it("saving a valid base currency sends the parsed save to the settings service", () => {
    const submitted = send(
      typedCurrency(editing(), "EUR"),
      SettingsMessage.Submitted()
    );

    expect(submitted.commands).toHaveLength(1);
    expect(submitted.commands?.[0]).toMatchObject({
      args: { save: settingsSave({ baseCurrency: "EUR" }) },
      name: "SaveSettings",
    });
    expect(saveTag(submitted.model)).toBe("Saving");
  });

  it("a completed save shows the new base currency and forgets the failure", () => {
    const saved = savedInto(demoSetup, settingsSave({ baseCurrency: "EUR" }));

    const submitted = send(
      typedCurrency(editing(), "EUR"),
      SettingsMessage.Submitted()
    );

    const completed = send(
      submitted.model,
      SettingsMessage.CompletedSave({ setup: saved })
    );

    expect(shown(completed.model)).toBe("EUR");
    expect(draftOf(completed.model)).toStrictEqual({
      baseCurrency: "EUR",
      locale: "en-GB",
      timezone: "Europe/London",
    });
    expect(saveTag(completed.model)).toBe("Saved");
  });

  it("a refused currency names the field, says what to fix, and keeps the saved value", () => {
    const submitted = send(
      typedCurrency(editing(), "EU"),
      SettingsMessage.Submitted()
    );

    expect(submitted.commands).toBeUndefined();
    expect(refusal(submitted.model)).toBe(
      "Base currency: enter a current three-letter code such as GBP."
    );
    expect(refusal(submitted.model)).not.toContain("Failed");
    expect(shown(submitted.model)).toBe("GBP");
    expect(saveTag(submitted.model)).toBe("Failed");
  });

  it("a currency the platform does not know is refused at the boundary", () => {
    const submitted = send(
      typedCurrency(editing(), "ZZZ"),
      SettingsMessage.Submitted()
    );

    expect(submitted.commands).toBeUndefined();
    expect(refusal(submitted.model)).toContain("Base currency:");
  });

  it("a refused language and time zone name their own fields", () => {
    const badLocale = send(
      typed(editing(), SettingsMessage.TypedLocale({ value: "en-gb" })),
      SettingsMessage.Submitted()
    );

    const badTimeZone = send(
      typed(
        editing(),
        SettingsMessage.TypedTimezone({ value: "Mars/Olympus" })
      ),
      SettingsMessage.Submitted()
    );

    expect(refusal(badLocale.model)).toBe(
      "Language: enter a language tag such as en-GB."
    );
    expect(refusal(badTimeZone.model)).toBe(
      "Time zone: enter an IANA time zone such as Europe/London."
    );
    expect(shown(badLocale.model)).toBe("GBP");
    expect(shown(badTimeZone.model)).toBe("GBP");
  });

  it("a second submit while the first save is in flight sends nothing", () => {
    const submitted = send(
      typedCurrency(editing(), "EUR"),
      SettingsMessage.Submitted()
    );

    const again = send(submitted.model, SettingsMessage.Submitted());

    expect(again.commands).toBeUndefined();
    expect(again.model).toStrictEqual(submitted.model);
  });

  it("typing while a save is in flight changes nothing", () => {
    const submitted = send(
      typedCurrency(editing(), "EUR"),
      SettingsMessage.Submitted()
    );

    const typedDuringSave = typedCurrency(submitted.model, "USD");

    expect(typedDuringSave).toStrictEqual(submitted.model);
    expect(saveTag(typedDuringSave)).toBe("Saving");
  });

  it("a save the settings service refuses shows its reason and keeps the old value", () => {
    const submitted = send(
      typedCurrency(editing(), "EUR"),
      SettingsMessage.Submitted()
    );

    const refused = send(
      submitted.model,
      SettingsMessage.FailedSave({
        reason:
          "The settings were not saved. The settings service refused the change. Fix: reload `/app/settings` and save again.",
      })
    );

    expect(refusal(refused.model)).toContain("The settings were not saved.");
    expect(refusal(refused.model)).toContain("Fix:");
    expect(shown(refused.model)).toBe("GBP");
    expect(saveTag(refused.model)).toBe("Failed");
  });

  it("a viewer cannot save", () => {
    const screen = typedCurrency(loaded("viewer"), "EUR");

    expect(screen).toStrictEqual(loaded("viewer"));
    expect(send(screen, SettingsMessage.Submitted()).commands).toBeUndefined();
  });

  it("a failed load says what to fix and can be retried", () => {
    const failed = send(
      initialSettings,
      SettingsMessage.FailedLoad({
        reason:
          "The settings could not be read. The settings service refused the read. Fix: reload `/app/settings` and try again.",
      })
    ).model;

    expect(SettingsScreen.guards.Unavailable(failed)).toBe(true);

    const retried = send(failed, SettingsMessage.Retried());

    expect(retried.commands).toHaveLength(1);
    expect(retried.commands?.[0]).toMatchObject({ name: "ReadSetup" });
    expect(SettingsScreen.guards.Loading(retried.model)).toBe(true);
  });

  it("a setup without a primary profile is reported instead of edited", () => {
    const screen = send(
      initialSettings,
      SettingsMessage.CompletedLoad({
        setup: { profiles: [], setting: null },
      })
    ).model;

    expect(SettingsScreen.guards.Unavailable(screen)).toBe(true);
  });

  it("a setup whose primary profile is missing is reported instead of edited", () => {
    const screen = send(
      initialSettings,
      SettingsMessage.CompletedLoad({
        setup: Schema.decodeSync(SetupSchema)({
          profiles: demoSetup.profiles,
          setting: {
            locale: "en-GB",
            primaryProfileId: "demo-missing",
            timezone: "Europe/London",
          },
        }),
      })
    ).model;

    expect(SettingsScreen.guards.Unavailable(screen)).toBe(true);
  });
});

describe("the settings draft boundary", () => {
  it("parses a valid draft into the save fields", () => {
    const parsed = parseDraft({
      baseCurrency: "EUR",
      locale: "de-DE",
      timezone: "Europe/Berlin",
    });

    expect(Result.isSuccess(parsed) ? parsed.success : undefined).toStrictEqual(
      {
        baseCurrency: "EUR",
        locale: "de-DE",
        timezone: "Europe/Berlin",
      }
    );
  });

  it("refuses each field the platform does not know, naming the field", () => {
    const cases = [
      {
        draft: {
          baseCurrency: "ZZZ",
          locale: "en-GB",
          timezone: "Europe/London",
        },
        names: "Base currency:",
      },
      {
        draft: {
          baseCurrency: "GBP",
          locale: "en-gb",
          timezone: "Europe/London",
        },
        names: "Language:",
      },
      {
        draft: {
          baseCurrency: "GBP",
          locale: "en-GB",
          timezone: "Mars/Olympus",
        },
        names: "Time zone:",
      },
    ] as const;

    for (const { draft, names } of cases) {
      const parsed = parseDraft(draft);

      expect(Result.isFailure(parsed)).toBe(true);
      expect(Result.isFailure(parsed) ? parsed.failure.message : "").toContain(
        names
      );
    }
  });
});

describe("the settings service behind the screen", () => {
  it.effect(
    "saves the base currency through the settings service and reads it back",
    () =>
      Effect.gen(function* saveThroughTheService() {
        const save = settingsSave({ baseCurrency: "EUR" });

        const gateway = yield* SettingsGateway;

        const saved = yield* SaveSettings({ save }).effect;
        const setup = yield* gateway.readSetup();

        expect(Schema.is(SettingsMessage.CompletedSave)(saved)).toBe(true);
        expect(
          setup.profiles.find((profile) => profile.id === "demo-business")
            ?.baseCurrency
        ).toBe("EUR");
      }).pipe(Effect.provide(SettingsGateway.layer))
  );

  it.effect("a save for an unknown profile names it and says what to fix", () =>
    Effect.gen(function* refuseUnknownProfile() {
      const refused = yield* SaveSettings({
        save: settingsSave({ primaryProfileId: "demo-missing" }),
      }).effect;

      expect(Schema.is(SettingsMessage.FailedSave)(refused)).toBe(true);

      if (Schema.is(SettingsMessage.FailedSave)(refused)) {
        expect(refused.reason).toContain("`demo-missing`");
        expect(refused.reason).toContain("Fix:");
      }
    }).pipe(Effect.provide(SettingsGateway.layer))
  );
});
