export { defineFlag, Flags } from "@pecunia/core/flags";

export type { Flag, FlagContext } from "@pecunia/core/flags";

export {
  flagCapabilities,
  getFlag,
  listFlags,
} from "@pecunia/core/flag-capabilities";

export {
  evaluateFlag,
  FlagRule,
  Percentage,
  subjectBucket,
} from "./evaluate.js";

export type { Rule } from "./evaluate.js";

export { checkFlagExpiry, ExpiredFlags } from "./expiry.js";
