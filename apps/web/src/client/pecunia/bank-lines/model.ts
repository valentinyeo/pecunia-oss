import {
  BankLineIdSchema,
  BankLineSchema,
  CategoryChangeSchema,
  CategoryFilterSchema,
  CategoryIdSchema,
  LineEditSchema,
  NoteChangeSchema,
  NoteTextSchema,
  NOTE_MAX_LENGTH,
  ReviewFilterSchema,
  SEARCH_MAX_LENGTH,
} from "@pecunia/bank-lines/model";
import type {
  BankLine,
  BankLineFilter,
  BankLineId,
  CategoryChange,
  CategoryId,
  NoteChange,
} from "@pecunia/bank-lines/model";
import { Option, pipe, Predicate, Result, Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

import type { CategoryChoiceValue } from "../catalogue.js";

export const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const Generation = Count;

export const Query = Schema.String.check(Schema.isMaxLength(SEARCH_MAX_LENGTH));

export type QueryValue = typeof Query.Type;

export const LineScope = defineTaggedUnion({
  All: {},
  Category: { categoryId: CategoryIdSchema },
});

export type LineScopeValue = typeof LineScope.Type;

export const LineList = defineTaggedUnion({
  Failed: { reason: Schema.NonEmptyString },
  Loading: {},
  Ready: { lines: Schema.Array(BankLineSchema), total: Count },
});

export type LineListValue = typeof LineList.Type;

export const EditDraft = Schema.Struct({
  category: Schema.OptionFromNullishOr(CategoryIdSchema),
  lineId: BankLineIdSchema,
  note: Schema.String,
});

export type EditDraftValue = typeof EditDraft.Type;

export const LineEditState = defineTaggedUnion({
  Draft: { draft: EditDraft },
  Failed: {
    draft: Schema.OptionFromNullishOr(EditDraft),
    reason: Schema.NonEmptyString,
  },
  Idle: {},
  Reviewing: { lineId: BankLineIdSchema },
  Saved: { lineId: BankLineIdSchema },
  Saving: { draft: EditDraft },
});

export type LineEditStateValue = typeof LineEditState.Type;

export const SuggestedLine = Schema.Struct({
  categoryId: CategoryIdSchema,
  confidence: Schema.Finite.check(Schema.isBetween({ maximum: 1, minimum: 0 })),
  lineId: BankLineIdSchema,
});

export type SuggestedLineValue = typeof SuggestedLine.Type;

export const Suggestions = defineTaggedUnion({
  Accepted: { count: Count },
  Accepting: { accepted: Count, items: Schema.Array(SuggestedLine) },
  Asking: {},
  Failed: { reason: Schema.NonEmptyString },
  Idle: {},
  Ready: { items: Schema.Array(SuggestedLine) },
});

export type SuggestionsValue = typeof Suggestions.Type;

export const BankLinesScreen = defineTaggedUnion({
  Browse: {
    edit: LineEditState,
    generation: Generation,
    list: LineList,
    scope: LineScope,
    search: Query,
  },
  Review: {
    edit: LineEditState,
    generation: Generation,
    list: LineList,
    suggestions: Suggestions,
  },
});

export type BankLinesScreenValue = typeof BankLinesScreen.Type;

export const initialBankLines: BankLinesScreenValue = BankLinesScreen.Browse({
  edit: LineEditState.Idle(),
  generation: 1,
  list: LineList.Loading(),
  scope: LineScope.All(),
  search: "",
});

export const lineLabel = (line: BankLine): string =>
  line.raw.merchant === "" ? line.raw.description : line.raw.merchant;

export const filterFor = (scope: LineScopeValue): BankLineFilter =>
  LineScope.match<BankLineFilter>(scope, {
    All: () => ({
      account: Option.none(),
      amount: Option.none(),
      category: CategoryFilterSchema.cases.Any.make({}),
      direction: Option.none(),
      occurred: Option.none(),
      review: ReviewFilterSchema.cases.Any.make({}),
    }),
    Category: ({ categoryId }) => ({
      account: Option.none(),
      amount: Option.none(),
      category: CategoryFilterSchema.cases.Of.make({ categoryId }),
      direction: Option.none(),
      occurred: Option.none(),
      review: ReviewFilterSchema.cases.Any.make({}),
    }),
  });

export const reviewFilter: BankLineFilter = {
  account: Option.none(),
  amount: Option.none(),
  category: CategoryFilterSchema.cases.Uncategorised.make({}),
  direction: Option.none(),
  occurred: Option.none(),
  review: ReviewFilterSchema.cases.Any.make({}),
};

export const sameScope = (
  left: LineScopeValue,
  right: LineScopeValue
): boolean =>
  LineScope.match(left, {
    All: () => LineScope.guards.All(right),
    Category: ({ categoryId }) =>
      LineScope.guards.Category(right) && right.categoryId === categoryId,
  });

export const categoryFromValue = (
  value: string,
  catalogue: readonly CategoryChoiceValue[]
): Option.Option<Option.Option<CategoryId>> => {
  if (value === "") {
    return Option.some(Option.none());
  }

  const offered = catalogue.find((choice) => choice.id === value);

  return Option.map(Option.fromUndefinedOr(offered), (choice) =>
    Option.some(choice.id)
  );
};

export const EditPlan = defineTaggedUnion({
  Invalid: { reason: Schema.NonEmptyString },
  Nothing: {},
  Send: { edit: LineEditSchema },
});

export type EditPlanValue = typeof EditPlan.Type;

const categoryChangeOf = (
  line: BankLine,
  chosen: Option.Option<CategoryId>
): CategoryChange =>
  Option.match(chosen, {
    onNone: () =>
      Option.isNone(line.category)
        ? CategoryChangeSchema.cases.Unchanged.make({})
        : CategoryChangeSchema.cases.Cleared.make({}),
    onSome: (categoryId) =>
      Option.exists(line.category, (current) => current === categoryId)
        ? CategoryChangeSchema.cases.Unchanged.make({})
        : CategoryChangeSchema.cases.Assigned.make({ categoryId }),
  });

const noteChangeOf = (
  line: BankLine,
  note: string
): Result.Result<NoteChange, string> => {
  if (line.note === note.trim()) {
    return Result.succeed(NoteChangeSchema.cases.Unchanged.make({}));
  }

  return Schema.decodeResult(NoteTextSchema)(note).pipe(
    Result.map((text) => NoteChangeSchema.cases.Set.make({ text })),
    Result.mapError(() => noteRefusal)
  );
};

const noteRefusal = `A note is ${NOTE_MAX_LENGTH} characters or fewer. Fix: shorten the note, then save the line again.`;

export const planEdit = (
  line: BankLine,
  draft: EditDraftValue
): EditPlanValue => {
  const category = categoryChangeOf(line, draft.category);

  const note = noteChangeOf(line, draft.note);

  if (Result.isFailure(note)) {
    return EditPlan.Invalid({ reason: note.failure });
  }

  if (
    Predicate.isTagged(category, "Unchanged") &&
    Predicate.isTagged(note.success, "Unchanged")
  ) {
    return EditPlan.Nothing();
  }

  return Schema.decodeResult(LineEditSchema)({
    category,
    lineId: line.id,
    note: note.success,
  }).pipe(
    Result.match({
      onFailure: () => EditPlan.Invalid({ reason: noteRefusal }),
      onSuccess: (edit) => EditPlan.Send({ edit }),
    })
  );
};

export const draftOfLine = (line: BankLine): EditDraftValue => ({
  category: line.category,
  lineId: line.id,
  note: line.note,
});

export const lineIn = (
  lines: readonly BankLine[],
  lineId: BankLineId
): Option.Option<BankLine> =>
  Option.fromUndefinedOr(lines.find((line) => line.id === lineId));

export const draftFor = (
  edit: LineEditStateValue,
  lineId: BankLineId
): Option.Option<EditDraftValue> => {
  const held = LineEditState.match<Option.Option<EditDraftValue>>(edit, {
    Draft: ({ draft }) => Option.some(draft),
    Failed: ({ draft }) => draft,
    Idle: () => Option.none(),
    Reviewing: () => Option.none(),
    Saved: () => Option.none(),
    Saving: () => Option.none(),
  });

  return pipe(
    held,
    Option.filter((draft) => draft.lineId === lineId)
  );
};

export const editNotice = (edit: LineEditStateValue): string =>
  LineEditState.match<string>(edit, {
    Draft: () => "",
    Failed: ({ reason }) => reason,
    Idle: () => "",
    Reviewing: () => "Marking reviewed…",
    Saved: () => "Saved.",
    Saving: () => "Saving…",
  });

export const suggestionFor = (
  suggestions: SuggestionsValue,
  lineId: BankLineId
): Option.Option<SuggestedLineValue> =>
  Suggestions.match<Option.Option<SuggestedLineValue>>(suggestions, {
    Accepted: () => Option.none(),
    Accepting: ({ items }) =>
      Option.fromUndefinedOr(items.find((item) => item.lineId === lineId)),
    Asking: () => Option.none(),
    Failed: () => Option.none(),
    Idle: () => Option.none(),
    Ready: ({ items }) =>
      Option.fromUndefinedOr(items.find((item) => item.lineId === lineId)),
  });

export const acceptanceNotice = (
  suggestions: SuggestionsValue
): Option.Option<string> =>
  Suggestions.match<Option.Option<string>>(suggestions, {
    Accepted: ({ count }) =>
      Option.some(
        count === 1
          ? "Accepted 1 suggestion."
          : `Accepted ${count} suggestions.`
      ),
    Accepting: ({ accepted, items }) =>
      Option.some(`Accepted ${accepted} of ${accepted + items.length}.`),
    Asking: () => Option.some("Asking the demo sorter for categories…"),
    Failed: ({ reason }) => Option.some(reason),
    Idle: () => Option.none(),
    Ready: ({ items }) => Option.some(readyNotice(items.length)),
  });

const readyNotice = (count: number): string => {
  if (count === 0) {
    return "The demo sorter has no suggestion above its confidence bar.";
  }

  return count === 1
    ? "1 suggestion is ready."
    : `${count} suggestions are ready.`;
};

export const awaitingReview = (line: BankLine): boolean =>
  Predicate.isTagged(line.review, "Awaiting");
