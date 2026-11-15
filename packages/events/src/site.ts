import type { EventsOptions } from "@pecunia/core/request-capture";
import { Effect, Layer } from "effect";

import { Basin, basinFoundation } from "./basin.js";
import { captureWith } from "./capture.js";

export { memoryEvents } from "./memory.js";

export const events = ({ enabled, id }: EventsOptions) =>
  enabled
    ? Layer.build(Basin({ id })).pipe(Effect.map(captureWith))
    : basinFoundation({ id }).pipe(Effect.andThen(Effect.undefined));
