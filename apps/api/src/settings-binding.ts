import type * as Cloudflare from "@alchemy.run/cloudflare";
import { Effect, Option } from "effect";

export const bindPlainSetting = (
  host: Cloudflare.Worker,
  name: string,
  value: Option.Option<string>
) =>
  Option.match(value, {
    onNone: () => Effect.void,
    onSome: (text) =>
      host.bind(name, { bindings: [{ name, text, type: "plain_text" }] }),
  });

export const bindSecretSetting = (
  host: Cloudflare.Worker,
  name: string,
  value: Option.Option<string>
) =>
  Option.match(value, {
    onNone: () => Effect.void,
    onSome: (text) =>
      host.bind(name, { bindings: [{ name, text, type: "secret_text" }] }),
  });
