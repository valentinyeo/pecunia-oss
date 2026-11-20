import { BankLinePageSchema } from "@pecunia/bank-lines/model";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { Query } from "../bank-lines/model.js";
import { Suggestion } from "./model.js";

export const Message = defineMessageUnion({
  CompletedSearch: { page: BankLinePageSchema, query: Query },
  FailedSearch: { query: Query, reason: Schema.NonEmptyString },
  PickedSuggestion: { suggestion: Suggestion },
  Retried: {},
  SubmittedSearch: {},
  TypedQuery: { value: Schema.String },
});

export type SearchMessageValue = typeof Message.Type;
