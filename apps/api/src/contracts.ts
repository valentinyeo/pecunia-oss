import { bankLineContracts } from "@pecunia/bank-lines/contracts";
import { toRpcGroup } from "@pecunia/capability/rpc-group";
import {
  importBankFileContract,
  listImportTargetsContract,
} from "@pecunia/core/bank-import";
import { investmentContracts } from "@pecunia/investments/contracts";
import { reportContracts } from "@pecunia/reporting/contracts";
import { settingsContracts } from "@pecunia/settings/contracts";
import { subscriptionContracts } from "@pecunia/subscriptions/contracts";

export const pecuniaContracts = [
  ...settingsContracts,
  ...bankLineContracts,
  ...subscriptionContracts,
  ...reportContracts,
  ...investmentContracts,
  listImportTargetsContract,
  importBankFileContract,
] as const;

export const pecuniaRpcGroup = toRpcGroup(pecuniaContracts);
