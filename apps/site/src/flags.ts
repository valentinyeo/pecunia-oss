import { eventFlags, eventsEnabled } from "@pecunia/core/flags";
import { cloudflareFlagsLayer } from "@pecunia/flags/cloudflare";
import { configFlagsLayer } from "@pecunia/flags/config";
import { Layer } from "effect";

export const flagsLayer = configFlagsLayer(eventFlags);

export const liveFlagsLayer = cloudflareFlagsLayer(eventFlags, flagsLayer, [
  eventsEnabled.name,
]).pipe(Layer.orDie);
