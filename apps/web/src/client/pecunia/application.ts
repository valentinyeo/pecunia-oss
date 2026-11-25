import { Layer } from "effect";
import { Runtime } from "foldkit";

import { BankLinesGateway } from "./bank-lines/gateway.js";
import { CategorizeGateway } from "./categorize/gateway.js";
import { Message } from "./message.js";
import { pecuniaProgram } from "./program.js";
import { SettingsGateway } from "./settings/gateway.js";

export const pecuniaResources = Layer.mergeAll(
  BankLinesGateway.layer,
  CategorizeGateway.layer,
  SettingsGateway.layer
);

export const pecuniaApplication = (container: HTMLElement | null) =>
  Runtime.makeApplication({
    ...pecuniaProgram,
    container,
    devTools: import.meta.env.DEV ? { Message } : false,
    resources: pecuniaResources,
  });
