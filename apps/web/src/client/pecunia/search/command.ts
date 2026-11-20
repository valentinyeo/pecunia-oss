import { Effect } from "effect";
import { Command } from "foldkit";

import { BankLinesGateway } from "../bank-lines/gateway.js";
import { filterFor, LineScope, Query } from "../bank-lines/model.js";
import { Message } from "./message.js";

export const SearchEverything = Command.define("SearchEverything", {
  args: { query: Query },
  execute: ({ query }) =>
    BankLinesGateway.use((gateway) =>
      gateway.list({ filter: filterFor(LineScope.All()), search: query })
    ).pipe(
      Effect.match({
        onFailure: (failure) =>
          Message.FailedSearch({ query, reason: failure.message }),
        onSuccess: (page) => Message.CompletedSearch({ page, query }),
      })
    ),
  messages: [Message.CompletedSearch, Message.FailedSearch],
});
