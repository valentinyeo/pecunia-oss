import { documentView } from "../../features/pecunia/app.js";
import { Model } from "./model.js";
import { routing } from "./routing.js";
import { init, update } from "./update.js";

export const pecuniaProgram = {
  Model,
  init,
  routing,
  update,
  view: documentView,
} as const;
