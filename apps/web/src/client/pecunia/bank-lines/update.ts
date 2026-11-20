import type {
  BankLine,
  BankLineFilter,
  BankLineId,
} from "@pecunia/bank-lines/model";
import { Option, Predicate } from "effect";
import type { Update } from "foldkit";

import { demoCatalogue } from "../catalogue.js";
import type { AccessRoleValue } from "../model.js";
import {
  AcceptSuggestion,
  LoadLines,
  ReviewLine,
  SaveLine,
  SuggestCategories,
} from "./command.js";
import type { BankLinesGateway } from "./gateway.js";
import { Message } from "./message.js";
import type { BankLinesMessageValue } from "./message.js";
import {
  BankLinesScreen,
  categoryFromValue,
  draftOfLine,
  EditPlan,
  filterFor,
  LineEditState,
  LineList,
  lineIn,
  planEdit,
  reviewFilter,
  sameScope,
  Suggestions,
} from "./model.js";
import type {
  BankLinesScreenValue,
  EditDraftValue,
  LineEditStateValue,
  LineListValue,
  LineScopeValue,
  SuggestedLineValue,
  SuggestionsValue,
} from "./model.js";
import { sortChoiceOf, sortableLineOf } from "./sorter.js";

export type BankLinesUpdate = Update.Return<
  BankLinesScreenValue,
  BankLinesMessageValue,
  BankLinesGateway
>;

interface BrowsePatch {
  readonly edit?: LineEditStateValue;
  readonly generation?: number;
  readonly list?: LineListValue;
  readonly search?: string;
}

interface ReviewPatch {
  readonly edit?: LineEditStateValue;
  readonly generation?: number;
  readonly list?: LineListValue;
  readonly suggestions?: SuggestionsValue;
}

const browseOf = (
  screen: Extract<BankLinesScreenValue, { readonly _tag: "Browse" }>,
  patch: BrowsePatch
): BankLinesScreenValue =>
  BankLinesScreen.Browse({
    edit: patch.edit ?? screen.edit,
    generation: patch.generation ?? screen.generation,
    list: patch.list ?? screen.list,
    scope: screen.scope,
    search: patch.search ?? screen.search,
  });

const reviewOf = (
  screen: Extract<BankLinesScreenValue, { readonly _tag: "Review" }>,
  patch: ReviewPatch
): BankLinesScreenValue =>
  BankLinesScreen.Review({
    edit: patch.edit ?? screen.edit,
    generation: patch.generation ?? screen.generation,
    list: patch.list ?? screen.list,
    suggestions: patch.suggestions ?? screen.suggestions,
  });

const withEdit = (
  screen: BankLinesScreenValue,
  edit: LineEditStateValue
): BankLinesScreenValue =>
  BankLinesScreen.match<BankLinesScreenValue>(screen, {
    Browse: (current) => browseOf(current, { edit }),
    Review: (current) => reviewOf(current, { edit }),
  });

const withList = (
  screen: BankLinesScreenValue,
  list: LineListValue
): BankLinesScreenValue =>
  BankLinesScreen.match<BankLinesScreenValue>(screen, {
    Browse: (current) => browseOf(current, { list }),
    Review: (current) => reviewOf(current, { list }),
  });

const withSuggestions = (
  screen: BankLinesScreenValue,
  suggestions: SuggestionsValue
): BankLinesScreenValue =>
  BankLinesScreen.match<BankLinesScreenValue>(screen, {
    Browse: () => screen,
    Review: (current) => reviewOf(current, { suggestions }),
  });

const listOf = (screen: BankLinesScreenValue): LineListValue =>
  BankLinesScreen.match<LineListValue>(screen, {
    Browse: ({ list }) => list,
    Review: ({ list }) => list,
  });

const linesOf = (screen: BankLinesScreenValue): readonly BankLine[] =>
  LineList.match<readonly BankLine[]>(listOf(screen), {
    Failed: () => [],
    Loading: () => [],
    Ready: ({ lines }) => lines,
  });

const draftOf = (edit: LineEditStateValue): Option.Option<EditDraftValue> =>
  LineEditState.match<Option.Option<EditDraftValue>>(edit, {
    Draft: ({ draft }) => Option.some(draft),
    Failed: ({ draft }) => draft,
    Idle: () => Option.none(),
    Reviewing: () => Option.none(),
    Saved: () => Option.none(),
    Saving: () => Option.none(),
  });

const writing = (edit: LineEditStateValue): boolean =>
  Predicate.isTagged(edit, "Saving") || Predicate.isTagged(edit, "Reviewing");

const accepting = (suggestions: SuggestionsValue): boolean =>
  Predicate.isTagged(suggestions, "Accepting");

const suggestionsOf = (screen: BankLinesScreenValue): SuggestionsValue =>
  BankLinesScreen.match<SuggestionsValue>(screen, {
    Browse: () => Suggestions.Idle(),
    Review: ({ suggestions }) => suggestions,
  });

const viewer = (role: AccessRoleValue): boolean => role === "viewer";

const replacing = (
  list: LineListValue,
  line: BankLine,
  keep: boolean
): LineListValue =>
  LineList.match<LineListValue>(list, {
    Failed: () => list,
    Loading: () => list,
    Ready: ({ lines, total }) =>
      keep
        ? LineList.Ready({
            lines: lines.map((candidate) =>
              candidate.id === line.id ? line : candidate
            ),
            total,
          })
        : LineList.Ready({
            lines: lines.filter((candidate) => candidate.id !== line.id),
            total: Math.max(0, total - 1),
          }),
  });

const listWithLine = (
  screen: BankLinesScreenValue,
  line: BankLine
): LineListValue =>
  BankLinesScreen.match<LineListValue>(screen, {
    Browse: ({ list }) => replacing(list, line, true),
    Review: ({ list }) => replacing(list, line, Option.isNone(line.category)),
  });

const load = (filter: BankLineFilter, generation: number, search: string) =>
  LoadLines({ filter, generation, search });

export const openBrowse = (
  scope: LineScopeValue,
  search: string,
  screen: BankLinesScreenValue
): BankLinesUpdate =>
  BankLinesScreen.match<BankLinesUpdate>(screen, {
    Browse: (current) =>
      sameScope(current.scope, scope) &&
      !Predicate.isTagged(current.list, "Loading")
        ? { model: screen }
        : {
            commands: [load(filterFor(scope), current.generation + 1, search)],
            model: browseOf(current, {
              edit: LineEditState.Idle(),
              generation: current.generation + 1,
              list: LineList.Loading(),
              search,
            }),
          },
    Review: () => ({
      commands: [load(filterFor(scope), 1, search)],
      model: BankLinesScreen.Browse({
        edit: LineEditState.Idle(),
        generation: 1,
        list: LineList.Loading(),
        scope,
        search,
      }),
    }),
  });

export const openReview = (screen: BankLinesScreenValue): BankLinesUpdate =>
  BankLinesScreen.match<BankLinesUpdate>(screen, {
    Browse: () => ({
      commands: [load(reviewFilter, 1, "")],
      model: BankLinesScreen.Review({
        edit: LineEditState.Idle(),
        generation: 1,
        list: LineList.Loading(),
        suggestions: Suggestions.Idle(),
      }),
    }),
    Review: (current) =>
      LineList.guards.Failed(current.list)
        ? {
            commands: [load(reviewFilter, current.generation + 1, "")],
            model: reviewOf(current, {
              generation: current.generation + 1,
              list: LineList.Loading(),
            }),
          }
        : { model: screen },
  });

const retried = (screen: BankLinesScreenValue): BankLinesUpdate =>
  BankLinesScreen.match<BankLinesUpdate>(screen, {
    Browse: (current) => ({
      commands: [
        load(filterFor(current.scope), current.generation + 1, current.search),
      ],
      model: browseOf(current, {
        generation: current.generation + 1,
        list: LineList.Loading(),
      }),
    }),
    Review: (current) => ({
      commands: [load(reviewFilter, current.generation + 1, "")],
      model: reviewOf(current, {
        generation: current.generation + 1,
        list: LineList.Loading(),
      }),
    }),
  });

const searched = (
  value: string,
  screen: BankLinesScreenValue
): BankLinesUpdate =>
  BankLinesScreen.match<BankLinesUpdate>(screen, {
    Browse: (current) => ({
      commands: [load(filterFor(current.scope), current.generation + 1, value)],
      model: browseOf(current, {
        generation: current.generation + 1,
        list: LineList.Loading(),
        search: value,
      }),
    }),
    Review: () => ({ model: screen }),
  });

const completedLoad = (
  generation: number,
  page: { readonly lines: readonly BankLine[]; readonly total: number },
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const current = BankLinesScreen.match<number>(screen, {
    Browse: ({ generation: value }) => value,
    Review: ({ generation: value }) => value,
  });

  return current === generation
    ? {
        model: withList(
          screen,
          LineList.Ready({ lines: page.lines, total: page.total })
        ),
      }
    : { model: screen };
};

const failedLoad = (
  generation: number,
  reason: string,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const current = BankLinesScreen.match<number>(screen, {
    Browse: ({ generation: value }) => value,
    Review: ({ generation: value }) => value,
  });

  return current === generation
    ? { model: withList(screen, LineList.Failed({ reason })) }
    : { model: screen };
};

const startedEdit = (
  role: AccessRoleValue,
  lineId: BankLineId,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const edit = BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit: current }) => current,
    Review: ({ edit: current }) => current,
  });

  if (viewer(role) || writing(edit)) {
    return { model: screen };
  }

  return Option.match(lineIn(linesOf(screen), lineId), {
    onNone: () => ({ model: screen }),
    onSome: (line) => ({
      model: withEdit(
        screen,
        LineEditState.Draft({ draft: draftOfLine(line) })
      ),
    }),
  });
};

const cancelledEdit = (screen: BankLinesScreenValue): BankLinesUpdate => {
  const edit = BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit: current }) => current,
    Review: ({ edit: current }) => current,
  });

  return writing(edit)
    ? { model: screen }
    : { model: withEdit(screen, LineEditState.Idle()) };
};

const withDraft = (
  screen: BankLinesScreenValue,
  change: (draft: EditDraftValue) => EditDraftValue
): BankLinesUpdate => {
  const edit = BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit: current }) => current,
    Review: ({ edit: current }) => current,
  });

  return Option.match(draftOf(edit), {
    onNone: () => ({ model: screen }),
    onSome: (draft) => ({
      model: withEdit(screen, LineEditState.Draft({ draft: change(draft) })),
    }),
  });
};

const typedNote = (
  value: string,
  screen: BankLinesScreenValue
): BankLinesUpdate => withDraft(screen, (draft) => ({ ...draft, note: value }));

const choseCategory = (
  value: string,
  screen: BankLinesScreenValue
): BankLinesUpdate =>
  Option.match(categoryFromValue(value, demoCatalogue), {
    onNone: () => ({ model: screen }),
    onSome: (category) =>
      withDraft(screen, (draft) => ({ ...draft, category })),
  });

const submittedEdit = (
  role: AccessRoleValue,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const edit = BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit: current }) => current,
    Review: ({ edit: current }) => current,
  });

  if (viewer(role) || writing(edit)) {
    return { model: screen };
  }

  return Option.match(draftOf(edit), {
    onNone: () => ({ model: screen }),
    onSome: (draft) =>
      Option.match(lineIn(linesOf(screen), draft.lineId), {
        onNone: () => ({ model: screen }),
        onSome: (line) =>
          EditPlan.match<BankLinesUpdate>(planEdit(line, draft), {
            Invalid: ({ reason }) => ({
              model: withEdit(
                screen,
                LineEditState.Failed({ draft: Option.some(draft), reason })
              ),
            }),
            Nothing: () => ({
              model: withEdit(screen, LineEditState.Idle()),
            }),
            Send: ({ edit: request }) => ({
              commands: [SaveLine({ edit: request })],
              model: withEdit(screen, LineEditState.Saving({ draft })),
            }),
          }),
      }),
  });
};

const savedLine = (
  line: BankLine,
  screen: BankLinesScreenValue
): BankLinesUpdate => ({
  model: withEdit(
    withList(screen, listWithLine(screen, line)),
    LineEditState.Saved({ lineId: line.id })
  ),
});

const failedEdit = (
  reason: string,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const edit = BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit: current }) => current,
    Review: ({ edit: current }) => current,
  });

  return {
    model: withEdit(
      screen,
      LineEditState.Failed({ draft: draftOf(edit), reason })
    ),
  };
};

const markedReviewed = (
  role: AccessRoleValue,
  lineId: BankLineId,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const edit = BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit: current }) => current,
    Review: ({ edit: current }) => current,
  });

  return viewer(role) || writing(edit) || Option.isSome(draftOf(edit))
    ? { model: screen }
    : {
        commands: [ReviewLine({ lineId })],
        model: withEdit(screen, LineEditState.Reviewing({ lineId })),
      };
};

const requestedSuggestions = (
  role: AccessRoleValue,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const edit = BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit: current }) => current,
    Review: ({ edit: current }) => current,
  });

  if (viewer(role) || writing(edit) || accepting(suggestionsOf(screen))) {
    return { model: screen };
  }

  return BankLinesScreen.match<BankLinesUpdate>(screen, {
    Browse: () => ({ model: screen }),
    Review: ({ list }) =>
      LineList.match<BankLinesUpdate>(list, {
        Failed: () => ({ model: screen }),
        Loading: () => ({ model: screen }),
        Ready: ({ lines }) => ({
          commands: [
            SuggestCategories({
              categories: demoCatalogue.map(sortChoiceOf),
              lines: lines.map(sortableLineOf),
            }),
          ],
          model: withSuggestions(screen, Suggestions.Asking()),
        }),
      }),
  });
};

const completedSuggestions = (
  items: readonly SuggestedLineValue[],
  screen: BankLinesScreenValue
): BankLinesUpdate =>
  Predicate.isTagged(suggestionsOf(screen), "Asking")
    ? {
        model: withSuggestions(
          screen,
          Suggestions.Ready({ items: [...items] })
        ),
      }
    : { model: screen };

const acceptedSuggestions = (
  role: AccessRoleValue,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const edit = BankLinesScreen.match<LineEditStateValue>(screen, {
    Browse: ({ edit: current }) => current,
    Review: ({ edit: current }) => current,
  });

  if (viewer(role) || writing(edit)) {
    return { model: screen };
  }

  return BankLinesScreen.match<BankLinesUpdate>(screen, {
    Browse: () => ({ model: screen }),
    Review: ({ suggestions }) =>
      Suggestions.match<BankLinesUpdate>(suggestions, {
        Accepted: () => ({ model: screen }),
        Accepting: () => ({ model: screen }),
        Asking: () => ({ model: screen }),
        Failed: () => ({ model: screen }),
        Idle: () => ({ model: screen }),
        Ready: ({ items }) =>
          items.length === 0
            ? { model: screen }
            : {
                commands: items.map((item) =>
                  AcceptSuggestion({
                    categoryId: item.categoryId,
                    lineId: item.lineId,
                  })
                ),
                model: withSuggestions(
                  screen,
                  Suggestions.Accepting({ accepted: 0, items })
                ),
              },
      }),
  });
};

const acceptedLine = (
  line: BankLine,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const suggestions = suggestionsOf(screen);

  if (!Predicate.isTagged(suggestions, "Accepting")) {
    return { model: screen };
  }

  const items = suggestions.items.filter((item) => item.lineId !== line.id);

  const accepted = suggestions.accepted + 1;

  return {
    model: withList(
      withSuggestions(
        screen,
        items.length === 0
          ? Suggestions.Accepted({ count: accepted })
          : Suggestions.Accepting({ accepted, items })
      ),
      listWithLine(screen, line)
    ),
  };
};

const refusedLine = (
  lineId: BankLineId,
  reason: string,
  screen: BankLinesScreenValue
): BankLinesUpdate => {
  const suggestions = suggestionsOf(screen);

  return Predicate.isTagged(suggestions, "Accepting") &&
    suggestions.items.some((item) => item.lineId === lineId)
    ? { model: withSuggestions(screen, Suggestions.Failed({ reason })) }
    : { model: screen };
};

export const update = (
  screen: BankLinesScreenValue,
  role: AccessRoleValue,
  message: BankLinesMessageValue
): BankLinesUpdate =>
  Message.match<BankLinesUpdate>(message, {
    AcceptedSuggestions: () => acceptedSuggestions(role, screen),
    CancelledEdit: () => cancelledEdit(screen),
    ChoseCategory: ({ value }) => choseCategory(value, screen),
    CompletedEdit: ({ line }) => savedLine(line, screen),
    CompletedLoad: ({ generation, page }) =>
      completedLoad(generation, page, screen),
    CompletedReview: ({ line }) => savedLine(line, screen),
    CompletedSuggestion: ({ line }) => acceptedLine(line, screen),
    CompletedSuggestions: ({ items }) => completedSuggestions(items, screen),
    FailedEdit: ({ reason }) => failedEdit(reason, screen),
    FailedLoad: ({ generation, reason }) =>
      failedLoad(generation, reason, screen),
    FailedReview: ({ reason }) => ({
      model: withEdit(
        screen,
        LineEditState.Failed({ draft: Option.none(), reason })
      ),
    }),
    FailedSuggestion: ({ lineId, reason }) =>
      refusedLine(lineId, reason, screen),
    MarkedReviewed: ({ lineId }) => markedReviewed(role, lineId, screen),
    RequestedSuggestions: () => requestedSuggestions(role, screen),
    Retried: () => retried(screen),
    StartedEdit: ({ lineId }) => startedEdit(role, lineId, screen),
    SubmittedEdit: () => submittedEdit(role, screen),
    TypedNote: ({ value }) => typedNote(value, screen),
    TypedSearch: ({ value }) => searched(value, screen),
  });
