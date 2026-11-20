import { demoCatalogue } from "../catalogue.js";
import { demoHoldings, demoMerchants } from "./demo.js";
import type { SearchWorld } from "./model.js";

export const demoWorld: SearchWorld = {
  catalogue: demoCatalogue,
  holdings: demoHoldings,
  merchants: demoMerchants,
};
