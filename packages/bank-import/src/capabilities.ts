import { implement } from "@pecunia/capability/implement";
import {
  importBankFileContract,
  listImportTargetsContract,
} from "@pecunia/core/bank-import";

import { ImportLedger } from "./import-ledger.js";
import { runImportMachine } from "./import-machine.js";

export const listImportTargets = implement(
  listImportTargetsContract,
  ({ profileId }) => ImportLedger.use((ledger) => ledger.listTargets(profileId))
);

export const importBankFile = implement(importBankFileContract, (input) =>
  runImportMachine(input)
);

export const bankImportCapabilities = [
  listImportTargets,
  importBankFile,
] as const;
