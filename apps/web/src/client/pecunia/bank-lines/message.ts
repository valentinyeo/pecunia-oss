import {
  BankLineIdSchema,
  BankLinePageSchema,
  BankLineSchema,
} from "@pecunia/bank-lines/model";
import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

import { Generation, SuggestedLine } from "./model.js";

export const Message = defineMessageUnion({
  AcceptedSuggestions: {},
  CancelledEdit: {},
  ChoseCategory: { value: Schema.String },
  CompletedEdit: { line: BankLineSchema },
  CompletedLoad: { generation: Generation, page: BankLinePageSchema },
  CompletedReview: { line: BankLineSchema },
  CompletedSuggestion: { line: BankLineSchema },
  CompletedSuggestions: { items: Schema.Array(SuggestedLine) },
  FailedEdit: { reason: Schema.NonEmptyString },
  FailedLoad: { generation: Generation, reason: Schema.NonEmptyString },
  FailedReview: { reason: Schema.NonEmptyString },
  FailedSuggestion: {
    lineId: BankLineIdSchema,
    reason: Schema.NonEmptyString,
  },
  MarkedReviewed: { lineId: BankLineIdSchema },
  RequestedSuggestions: {},
  Retried: {},
  StartedEdit: { lineId: BankLineIdSchema },
  SubmittedEdit: {},
  TypedNote: { value: Schema.String },
  TypedSearch: { value: Schema.String },
});

export type BankLinesMessageValue = typeof Message.Type;
