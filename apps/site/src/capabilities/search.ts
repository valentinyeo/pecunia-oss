import { implement } from "@pecunia/capability/implement";
import { searchContract } from "@pecunia/core/contracts";
import { Effect } from "effect";

import { ContentStore } from "../content-store.js";

export const search = implement(searchContract, ({ limit, query }) =>
  ContentStore.use((store) => store.search(query, limit)).pipe(
    Effect.map((matches) => ({ matches, total: matches.length }))
  )
);
