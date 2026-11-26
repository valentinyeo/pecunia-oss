import { bankLineContracts } from "@pecunia/bank-lines/contracts";
import { toRpcGroup } from "@pecunia/capability/rpc-group";
import { reportContracts } from "@pecunia/reporting/contracts";
import { settingsContracts } from "@pecunia/settings/contracts";
import { subscriptionContracts } from "@pecunia/subscriptions/contracts";

export const pecuniaContracts = [
  ...settingsContracts,
  ...bankLineContracts,
  ...subscriptionContracts,
  ...reportContracts,
] as const;

export const pecuniaRpcGroup = toRpcGroup(pecuniaContracts);
