import { bankImportContracts } from "@pecunia/bank-import/contracts";
import { bankLineContracts } from "@pecunia/bank-lines/contracts";
import { toRpcGroup } from "@pecunia/capability/rpc-group";
import { investmentContracts } from "@pecunia/investments/contracts";
import { reportContracts } from "@pecunia/reporting/contracts";
import { settingsContracts } from "@pecunia/settings/contracts";
import { subscriptionContracts } from "@pecunia/subscriptions/contracts";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { RpcClient, RpcSerialization } from "effect/rpc";

const contracts = [
  ...settingsContracts,
  ...bankLineContracts,
  ...subscriptionContracts,
  ...reportContracts,
  ...investmentContracts,
  ...bankImportContracts,
] as const;

const { group } = toRpcGroup(contracts);

const defaultProtocolLayer = RpcClient.layerProtocolHttp({
  url: "/app/rpc",
}).pipe(Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson]));

const makeWithProtocol = (url: string) =>
  Effect.gen(function* makePecuniaApi() {
    const protocol = RpcClient.layerProtocolHttp({ url }).pipe(
      Layer.provide([FetchHttpClient.layer, RpcSerialization.layerJson])
    );

    return yield* RpcClient.make(group).pipe(Effect.provide(protocol));
  });

const makeDefault = RpcClient.make(group).pipe(
  Effect.provide(defaultProtocolLayer)
);

export type PecuniaApiService = Effect.Success<typeof makeDefault>;

export class PecuniaApi extends Context.Service<
  PecuniaApi,
  PecuniaApiService
>()("@pecunia/web/PecuniaApi", {
  make: makeDefault,
}) {
  static readonly layer = Layer.effect(this, this.make);

  static readonly layerForUrl = (url: string) =>
    Layer.effect(this, makeWithProtocol(url));
}
