import { Config, Context, Effect, Layer, Schema } from "effect";

export const AccessSettingsSchema = Schema.Struct({
  audience: Schema.NonEmptyString,
  teamDomain: Schema.NonEmptyString,
});

export type AccessSettings = typeof AccessSettingsSchema.Type;

export interface AccessUrls {
  readonly certs: string;
  readonly issuer: string;
}

export class AccessConfig extends Context.Service<
  AccessConfig,
  AccessSettings
>()("@pecunia/access/AccessConfig", {
  make: Effect.gen(function* makeAccessConfig() {
    const audience = yield* Config.NonEmptyString("ACCESS_AUD");
    const teamDomain = yield* Config.NonEmptyString("ACCESS_TEAM_DOMAIN");

    return { audience, teamDomain };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly configLayer = (settings: AccessSettings) =>
    Layer.succeed(this, settings);
}

export const accessUrls = (settings: AccessSettings): AccessUrls => ({
  certs: `https://${settings.teamDomain}/cdn-cgi/access/certs`,
  issuer: `https://${settings.teamDomain}`,
});
