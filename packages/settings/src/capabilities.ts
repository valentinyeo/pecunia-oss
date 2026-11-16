import { implement } from "@pecunia/capability/implement";
import {
  createProfileContract,
  readSetupContract,
  saveSettingsContract,
} from "@pecunia/core/settings";

import { SettingsStore } from "./settings-store.js";

export const readSetup = implement(readSetupContract, () =>
  SettingsStore.use((store) => store.readSetup())
);

export const saveSettings = implement(saveSettingsContract, (settings) =>
  SettingsStore.use((store) => store.saveSetting(settings))
);

export const createProfile = implement(createProfileContract, (profile) =>
  SettingsStore.use((store) => store.createProfile(profile))
);

export const settingsCapabilities = [
  readSetup,
  saveSettings,
  createProfile,
] as const;
