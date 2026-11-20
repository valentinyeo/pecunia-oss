import type { Update } from "foldkit";

import type { BankLinesGateway } from "../bank-lines/gateway.js";
import { SearchEverything } from "./command.js";
import { Message } from "./message.js";
import type { SearchMessageValue } from "./message.js";
import {
  Findings,
  findingsOf,
  suggestionsFor,
  withinSearchLimit,
} from "./model.js";
import type { SearchModelValue } from "./model.js";
import { demoWorld } from "./world.js";

export type SearchUpdate = Update.Return<
  SearchModelValue,
  SearchMessageValue,
  BankLinesGateway
>;

const withQuery = (
  screen: SearchModelValue,
  query: string
): SearchModelValue => ({
  ...screen,
  query,
  suggestions: suggestionsFor(query, demoWorld),
});

const searched = (screen: SearchModelValue): SearchUpdate =>
  screen.query.trim() === ""
    ? {
        model: {
          ...withQuery(screen, screen.query),
          findings: Findings.Idle(),
        },
      }
    : {
        commands: [SearchEverything({ query: screen.query })],
        model: {
          ...withQuery(screen, screen.query),
          findings: Findings.Searching({ query: screen.query }),
        },
      };

export const openSearch = (
  query: string,
  screen: SearchModelValue
): SearchUpdate => {
  const reset = { ...withQuery(screen, query), findings: Findings.Idle() };

  return query.trim() === ""
    ? { model: reset }
    : {
        commands: [SearchEverything({ query })],
        model: { ...reset, findings: Findings.Searching({ query }) },
      };
};

export const update = (
  screen: SearchModelValue,
  message: SearchMessageValue
): SearchUpdate =>
  Message.match<SearchUpdate>(message, {
    CompletedSearch: ({ page, query }) =>
      query === screen.query
        ? { model: { ...screen, findings: findingsOf(query, page, demoWorld) } }
        : { model: screen },
    FailedSearch: ({ query, reason }) =>
      query === withinSearchLimit(screen.query)
        ? { model: { ...screen, findings: Findings.Failed({ query, reason }) } }
        : { model: screen },
    PickedSuggestion: ({ suggestion }) =>
      searched(withQuery(screen, suggestion.label)),
    Retried: () => searched(screen),
    SubmittedSearch: () => searched(screen),
    TypedQuery: ({ value }) => ({
      model: withQuery(screen, value),
    }),
  });
