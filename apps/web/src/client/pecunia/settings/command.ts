import { SettingsSaveSchema } from "@pecunia/core/contracts";
import { Effect } from "effect";
import { Command } from "foldkit";

import { SettingsGateway } from "./gateway.js";
import { Message } from "./message.js";

export const ReadSetup = Command.define("ReadSetup", {
  execute: SettingsGateway.use((gateway) => gateway.readSetup()).pipe(
    Effect.match({
      onFailure: (failure) => Message.FailedLoad({ reason: failure.message }),
      onSuccess: (setup) => Message.CompletedLoad({ setup }),
    })
  ),
  messages: [Message.CompletedLoad, Message.FailedLoad],
});

export const SaveSettings = Command.define("SaveSettings", {
  args: { save: SettingsSaveSchema },
  execute: ({ save }) =>
    SettingsGateway.use((gateway) => gateway.saveSettings(save)).pipe(
      Effect.match({
        onFailure: (failure) => Message.FailedSave({ reason: failure.message }),
        onSuccess: (setup) => Message.CompletedSave({ setup }),
      })
    ),
  messages: [Message.CompletedSave, Message.FailedSave],
});
