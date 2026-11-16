import { Effect, Option, Schema } from "effect";
import { Command } from "foldkit";
import { load, pushUrl } from "foldkit/navigation";
import { fromString } from "foldkit/url";

import { Message } from "./message.js";

export const Navigate = Command.define("Navigate", {
  args: { url: Schema.String },
  execute: ({ url }) =>
    pushUrl(url).pipe(
      Effect.andThen(
        Effect.sync(() => {
          window.scrollTo(0, 0);
        })
      ),
      Effect.as(Message.CompletedNavigate())
    ),
  messages: [Message.CompletedNavigate],
});

export const ReadLocation = Command.define("ReadLocation", {
  execute: Effect.sync(() =>
    Option.match(fromString(window.location.href), {
      onNone: () => Message.CompletedNavigate(),
      onSome: (url) => Message.ChangedUrl({ url }),
    })
  ),
  messages: [Message.ChangedUrl, Message.CompletedNavigate],
});

export const LoadExternal = Command.define("LoadExternal", {
  args: { href: Schema.String },
  execute: ({ href }) =>
    load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
  messages: [Message.CompletedLoadExternal],
});
