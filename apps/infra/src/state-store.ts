import * as Cloudflare from "@alchemy.run/cloudflare";

export const ratstackStateStoreName =
  "alchemy-state-store-ratstack-state-store";

export const ratstackState = (state = Cloudflare.state) =>
  state({ workerName: ratstackStateStoreName });

export const pecuniaStateStoreName = "alchemy-state-store-pecunia-state-store";

export const pecuniaState = (state = Cloudflare.state) =>
  state({ workerName: pecuniaStateStoreName });
