import { SetupSchema, UnknownProfile } from "@pecunia/core/contracts";
import type {
  SettingsSave,
  SettingsUnavailable,
  Setup,
} from "@pecunia/core/contracts";
import { memorySettingsLayer } from "@pecunia/settings/memory";
import type { SettingsSeed } from "@pecunia/settings/memory";
import { SettingsStore } from "@pecunia/settings/store";
import { Context, Effect, Layer, Schema } from "effect";

import { SettingsGatewayFailure } from "./gateway-failure.js";

const demoSetup: Setup = Schema.decodeSync(SetupSchema)({
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

const demoSeed: SettingsSeed = {
  profiles: demoSetup.profiles,
  setting: demoSetup.setting ?? undefined,
};

const readFailure = (cause: SettingsUnavailable) =>
  new SettingsGatewayFailure({
    cause,
    message:
      "The settings could not be read. The settings service refused the read. Fix: reload `/app/settings` and try again.",
  });

const saveFailure = (cause: SettingsUnavailable | UnknownProfile) =>
  Schema.is(UnknownProfile)(cause)
    ? new SettingsGatewayFailure({
        cause,
        message: `The settings were not saved. No profile called \`${cause.profileId}\` exists. Fix: reload \`/app/settings\` to read the current profiles, then save again.`,
      })
    : new SettingsGatewayFailure({
        cause,
        message:
          "The settings were not saved. The settings service refused the change. Fix: reload `/app/settings` and save again.",
      });

const make = Effect.gen(function* makeSettingsGateway() {
  const store = yield* SettingsStore;

  return {
    readSetup: () => store.readSetup().pipe(Effect.mapError(readFailure)),
    saveSettings: (settings: SettingsSave) =>
      store.saveSetting(settings).pipe(Effect.mapError(saveFailure)),
  };
});

export class SettingsGateway extends Context.Service<
  SettingsGateway,
  Effect.Success<typeof make>
>()("@pecunia/web/SettingsGateway", { make }) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(memorySettingsLayer(demoSeed))
  );
}
