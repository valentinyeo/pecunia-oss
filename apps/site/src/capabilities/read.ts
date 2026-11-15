import { implement } from "@pecunia/capability/implement";
import { readContract } from "@pecunia/core/contracts";

import { ContentStore } from "../content-store.js";

export const read = implement(readContract, ({ id }) =>
  ContentStore.use((store) => store.read(id))
);
