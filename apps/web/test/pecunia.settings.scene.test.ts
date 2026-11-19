import { it } from "@effect/vitest";
import { Option } from "effect";
import * as Scene from "foldkit/scene";
import { fromString } from "foldkit/url";

import { Message } from "../src/client/pecunia/message.js";
import { initialModel } from "../src/client/pecunia/model.js";
import {
  ReadSetup,
  SaveSettings,
} from "../src/client/pecunia/settings/command.js";
import { Message as SettingsMessage } from "../src/client/pecunia/settings/message.js";
import { update, view } from "../src/features/pecunia/app.js";
import {
  demoSetup,
  savedInto,
  settingsSave,
} from "./pecunia-settings-fixture.js";

const url = (path: string) =>
  Option.getOrThrow(fromString(`https://pecunia.test${path}`));

const openSettings = Scene.Subscription.emit(
  Message.ChangedUrl({ url: url("/app/settings") })
);

const loaded = Scene.Command.resolve(
  ReadSetup,
  SettingsMessage.CompletedLoad({ setup: demoSetup })
);

const baseCurrencyValue = Scene.selector('[data-saved="base-currency"]');

const baseCurrencyField = Scene.role("textbox", { name: "Base currency" });

it("an owner changes the base currency and sees the saved value", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openSettings,
    Scene.Command.expectExact(ReadSetup()),
    loaded,
    Scene.expect(Scene.role("heading", { name: "Settings" })).toExist(),
    Scene.expect(Scene.text("Example Ltd")).toExist(),
    Scene.expect(Scene.text("Demo Person")).toExist(),
    Scene.expect(baseCurrencyValue).toHaveText("GBP"),
    Scene.expect(Scene.selector('[data-saved="language"]')).toHaveText("en-GB"),
    Scene.expect(Scene.selector('[data-saved="timezone"]')).toHaveText(
      "Europe/London"
    ),
    Scene.expect(baseCurrencyField).toHaveValue("GBP"),
    Scene.type(baseCurrencyField, "EUR"),
    Scene.expect(baseCurrencyValue).toHaveText("GBP"),
    Scene.submit(Scene.selector("form")),
    Scene.Command.expectExact(
      SaveSettings({ save: settingsSave({ baseCurrency: "EUR" }) })
    ),
    Scene.Command.resolve(
      SaveSettings,
      SettingsMessage.CompletedSave({
        setup: savedInto(demoSetup, settingsSave({ baseCurrency: "EUR" })),
      })
    ),
    Scene.expect(baseCurrencyValue).toHaveText("EUR"),
    Scene.expect(baseCurrencyField).toHaveValue("EUR"),
    Scene.expect(Scene.text("Saved.")).toExist()
  );
});

it("a refused base currency says what to fix and keeps the saved value", () => {
  Scene.scene(
    { update, view },
    Scene.given(initialModel),
    openSettings,
    loaded,
    Scene.type(baseCurrencyField, "EU"),
    Scene.submit(Scene.selector("form")),
    Scene.Command.expectNone(),
    Scene.expect(Scene.role("alert")).toHaveText(
      "Base currency: enter a current three-letter code such as GBP."
    ),
    Scene.expect(baseCurrencyValue).toHaveText("GBP"),
    Scene.expect(baseCurrencyField).toHaveValue("EU")
  );
});

it("a viewer sees the values and no way to save them", () => {
  Scene.scene(
    { update, view },
    Scene.given({ ...initialModel, access: "viewer" }),
    openSettings,
    loaded,
    Scene.expect(baseCurrencyValue).toHaveText("GBP"),
    Scene.expect(Scene.selector('[data-saved="language"]')).toHaveText("en-GB"),
    Scene.expect(Scene.text("Example Ltd")).toExist(),
    Scene.expect(
      Scene.text("Read-only. Only an owner can change these settings.")
    ).toExist(),
    Scene.expect(Scene.role("button", { name: "Save settings" })).toBeAbsent(),
    Scene.expect(Scene.selector("form")).toBeAbsent()
  );
});
