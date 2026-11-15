import { EventSink } from "@pecunia/core/event-sink";
import type { RawEvent } from "@pecunia/core/event-sink";
import { Context, Effect, Layer, Ref } from "effect";

import { captureWith } from "./capture.js";
import { VisitorSalt } from "./visitor-salt.js";

export class EventSinkMemory extends Context.Service<
  EventSinkMemory,
  { readonly events: Effect.Effect<readonly RawEvent[]> }
>()("@pecunia/events/EventSinkMemory") {}

const memoryServices = (salt: string) =>
  Effect.gen(function* buildMemoryServices() {
    const recorded = yield* Ref.make<readonly RawEvent[]>([]);

    return Context.make(EventSink, {
      send: (events) => Ref.update(recorded, (all) => [...all, ...events]),
    }).pipe(
      Context.add(EventSinkMemory, { events: Ref.get(recorded) }),
      Context.add(VisitorSalt, { salt: Effect.succeed(salt) })
    );
  });

export const memoryEventsLayer = (salt: string) =>
  Layer.effectContext(memoryServices(salt));

export const memoryEvents = (salt: string) =>
  memoryServices(salt).pipe(
    Effect.map((services) => ({
      capture: captureWith(services),
      recorded: Context.get(services, EventSinkMemory).events,
    }))
  );
