import { CategoryChoiceSchema, SortableLineSchema } from "@pecunia/ai-sorting";
import {
  BankLineFilterSchema,
  BankLineIdSchema,
  CategoryChangeSchema,
  CategoryIdSchema,
  LineEditSchema,
  NoteChangeSchema,
} from "@pecunia/bank-lines/model";
import { Effect, Schema } from "effect";
import { Command } from "foldkit";

import { BankLinesGateway } from "./gateway.js";
import { Message } from "./message.js";
import { Generation, Query } from "./model.js";
import { suggestCategories, suggestedOf } from "./sorter.js";

export const LoadLines = Command.define("LoadLines", {
  args: { filter: BankLineFilterSchema, generation: Generation, search: Query },
  execute: ({ filter, generation, search }) =>
    BankLinesGateway.use((gateway) => gateway.list({ filter, search })).pipe(
      Effect.match({
        onFailure: (failure) =>
          Message.FailedLoad({ generation, reason: failure.message }),
        onSuccess: (page) => Message.CompletedLoad({ generation, page }),
      })
    ),
  messages: [Message.CompletedLoad, Message.FailedLoad],
});

export const SaveLine = Command.define("SaveLine", {
  args: { edit: LineEditSchema },
  execute: ({ edit }) =>
    BankLinesGateway.use((gateway) => gateway.edit(edit)).pipe(
      Effect.match({
        onFailure: (failure) => Message.FailedEdit({ reason: failure.message }),
        onSuccess: (line) => Message.CompletedEdit({ line }),
      })
    ),
  messages: [Message.CompletedEdit, Message.FailedEdit],
});

export const ReviewLine = Command.define("ReviewLine", {
  args: { lineId: BankLineIdSchema },
  execute: ({ lineId }) =>
    BankLinesGateway.use((gateway) => gateway.review({ lineId })).pipe(
      Effect.match({
        onFailure: (failure) =>
          Message.FailedReview({ reason: failure.message }),
        onSuccess: (line) => Message.CompletedReview({ line }),
      })
    ),
  messages: [Message.CompletedReview, Message.FailedReview],
});

export const AcceptSuggestion = Command.define("AcceptSuggestion", {
  args: { categoryId: CategoryIdSchema, lineId: BankLineIdSchema },
  execute: ({ categoryId, lineId }) =>
    BankLinesGateway.use((gateway) =>
      gateway.edit({
        category: CategoryChangeSchema.cases.Assigned.make({ categoryId }),
        lineId,
        note: NoteChangeSchema.cases.Unchanged.make({}),
      })
    ).pipe(
      Effect.match({
        onFailure: (failure) =>
          Message.FailedSuggestion({ lineId, reason: failure.message }),
        onSuccess: (line) => Message.CompletedSuggestion({ line }),
      })
    ),
  messages: [Message.CompletedSuggestion, Message.FailedSuggestion],
});

export const SuggestCategories = Command.define("SuggestCategories", {
  args: {
    categories: Schema.Array(CategoryChoiceSchema),
    lines: Schema.Array(SortableLineSchema),
  },
  execute: ({ categories, lines }) =>
    suggestCategories(lines, categories).pipe(
      Effect.map((result) =>
        Message.CompletedSuggestions({ items: suggestedOf(result) })
      )
    ),
  messages: [Message.CompletedSuggestions],
});
