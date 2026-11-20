import { Button, Select, Textarea } from "@foldkit/ui";
import { SEARCH_MAX_LENGTH } from "@pecunia/bank-lines/model";
import type { BankLine } from "@pecunia/bank-lines/model";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/pecunia/bank-lines/message.js";
import type { BankLinesMessageValue } from "../../client/pecunia/bank-lines/message.js";
import {
  acceptanceNotice,
  awaitingReview,
  BankLinesScreen,
  draftFor,
  editNotice,
  LineEditState,
  LineList,
  lineLabel,
  LineScope,
  suggestionFor,
  Suggestions,
} from "../../client/pecunia/bank-lines/model.js";
import type {
  BankLinesScreenValue,
  EditDraftValue,
  LineEditStateValue,
  LineListValue,
  SuggestedLineValue,
  SuggestionsValue,
} from "../../client/pecunia/bank-lines/model.js";
import {
  categoryNameOf,
  demoCatalogue,
} from "../../client/pecunia/catalogue.js";
import type { CategoryChoiceValue } from "../../client/pecunia/catalogue.js";
import { spendingRouter } from "../../client/pecunia/route.js";
import { listStyles } from "./bank-lines.stylex.js";
import { formatDay } from "./day-format.js";
import { signedAmount } from "./line-amount.js";
import { styles } from "./pecunia.stylex.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

const lineName = (line: BankLine): string =>
  `${lineLabel(line)} on ${formatDay(line.valueDate)}`;

const categoryNode = (
  line: BankLine,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  Option.match(line.category, {
    onNone: () =>
      h.span(
        [h.Class(className(listStyles.uncategorised))],
        [categoryNameOf(demoCatalogue, Option.none())]
      ),
    onSome: (categoryId) =>
      h.a(
        [
          h.Class(
            stylex.props(listStyles.categoryLink, listStyles.focus).className ??
              ""
          ),
          h.Href(spendingRouter({ categoryId })),
        ],
        [categoryNameOf(demoCatalogue, Option.some(categoryId))]
      ),
  });

const reviewNode = (
  line: BankLine,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  awaitingReview(line)
    ? h.span(
        [h.Class(className(listStyles.badgeAwaiting))],
        ["Awaiting review"]
      )
    : h.span([h.Class(className(listStyles.badge))], ["Reviewed"]);

const categoryField = (
  draft: EditDraftValue,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  Select.view(
    {
      hasDescription: true,
      id: `line-category-${draft.lineId}`,
      name: `line-category-${draft.lineId}`,
      onChange: (value: string) => Message.ChoseCategory({ value }),
      toView: ({ description, label, select }) =>
        h.div(
          [h.Class(className(listStyles.field))],
          [
            h.label(
              [...label, h.Class(className(listStyles.fieldLabel))],
              ["Category"]
            ),
            h.select(
              [
                ...select,
                h.Class(
                  stylex.props(listStyles.fieldInput, listStyles.focus)
                    .className ?? ""
                ),
              ],
              [
                h.option([h.Value("")], ["No category"]),
                ...demoCatalogue.map((choice: CategoryChoiceValue) =>
                  h.option([h.Value(choice.id)], [choice.name])
                ),
              ]
            ),
            h.p(
              [...description, h.Class(className(listStyles.fieldHint))],
              ["Only the categories this profile owns are offered."]
            ),
          ]
        ),
      value: Option.getOrElse(draft.category, () => ""),
    },
    h
  );

const noteField = (
  draft: EditDraftValue,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  Textarea.view(
    {
      hasDescription: true,
      id: `line-note-${draft.lineId}`,
      name: `line-note-${draft.lineId}`,
      onInput: (value: string) => Message.TypedNote({ value }),
      rows: 2,
      toView: ({ description, label, textarea }) =>
        h.div(
          [h.Class(className(listStyles.field))],
          [
            h.label(
              [...label, h.Class(className(listStyles.fieldLabel))],
              ["Note"]
            ),
            h.textarea([
              ...textarea,
              h.Class(
                stylex.props(listStyles.fieldInput, listStyles.focus)
                  .className ?? ""
              ),
              h.Value(draft.note),
            ]),
            h.p(
              [...description, h.Class(className(listStyles.fieldHint))],
              ["Up to 500 characters. A save trims the ends."]
            ),
          ]
        ),
      value: draft.note,
    },
    h
  );

const plainButton = (
  label: string,
  onClick: BankLinesMessageValue,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  Button.view(
    {
      onClick,
      toView: ({ button }) =>
        h.button(
          [
            ...button,
            h.Class(
              stylex.props(listStyles.plainButton, listStyles.focus)
                .className ?? ""
            ),
          ],
          [label]
        ),
      type: "button",
    },
    h
  );

const strongButton = (
  label: string,
  onClick: BankLinesMessageValue,
  h: HtmlBuilder<BankLinesMessageValue>,
  isDisabled = false
): Html =>
  Button.view(
    {
      isDisabled,
      onClick,
      toView: ({ button }) =>
        h.button(
          [
            ...button,
            h.Class(
              stylex.props(
                listStyles.saveButton,
                listStyles.focus,
                isDisabled && listStyles.disabledButton
              ).className ?? ""
            ),
          ],
          [label]
        ),
      type: "button",
    },
    h
  );

const editForm = (
  draft: EditDraftValue,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.form(
    [
      h.Class(className(listStyles.editForm)),
      h.OnSubmit(Message.SubmittedEdit()),
    ],
    [
      categoryField(draft, h),
      noteField(draft, h),
      h.div(
        [h.Class(className(listStyles.editActions))],
        [
          Button.view(
            {
              toView: ({ button }) =>
                h.button(
                  [
                    ...button,
                    h.Class(
                      stylex.props(listStyles.saveButton, listStyles.focus)
                        .className ?? ""
                    ),
                  ],
                  ["Save line"]
                ),
              type: "submit",
            },
            h
          ),
          plainButton("Cancel", Message.CancelledEdit(), h),
        ]
      ),
    ]
  );

const rowActions = (
  line: BankLine,
  canWrite: boolean,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.div(
    [h.Class(className(listStyles.rowActions))],
    [
      canWrite
        ? plainButton(
            `Edit ${lineName(line)}`,
            Message.StartedEdit({ lineId: line.id }),
            h
          )
        : null,
      canWrite && awaitingReview(line)
        ? plainButton(
            `Mark ${lineName(line)} reviewed`,
            Message.MarkedReviewed({ lineId: line.id }),
            h
          )
        : null,
    ]
  );

const suggestionNode = (
  suggestion: SuggestedLineValue,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.p(
    [h.Class(className(listStyles.suggestion))],
    [
      `Suggested: ${categoryNameOf(demoCatalogue, Option.some(suggestion.categoryId))} at ${Math.round(
        suggestion.confidence * 100
      )}% confidence`,
    ]
  );

const lineRow = (
  line: BankLine,
  edit: LineEditStateValue,
  suggestions: Option.Option<SuggestionsValue>,
  canWrite: boolean,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.li(
    [
      h.Key(line.id),
      h.DataAttribute("line", line.id),
      h.Class(className(listStyles.row)),
    ],
    [
      h.div(
        [h.Class(className(listStyles.rowHead))],
        [
          h.span(
            [h.Class(className(listStyles.rowDay))],
            [formatDay(line.valueDate)]
          ),
          h.span([h.Class(className(listStyles.rowLabel))], [lineLabel(line)]),
          h.span(
            [
              h.Class(
                stylex.props(
                  listStyles.rowAmount,
                  line.direction === "out" && styles.valueDebit
                ).className ?? ""
              ),
            ],
            [signedAmount(line)]
          ),
        ]
      ),
      h.div(
        [h.Class(className(listStyles.rowMeta))],
        [
          categoryNode(line, h),
          line.raw.description === lineLabel(line)
            ? null
            : h.span(
                [h.Class(className(listStyles.rowText))],
                [line.raw.description]
              ),
          line.note === ""
            ? null
            : h.span([h.Class(className(listStyles.rowNote))], [line.note]),
          line.status === "pending"
            ? h.span([h.Class(className(listStyles.badge))], ["Pending"])
            : null,
          reviewNode(line, h),
        ]
      ),
      Option.match(suggestions, {
        onNone: () => null,
        onSome: (held) =>
          Option.match(suggestionFor(held, line.id), {
            onNone: () => null,
            onSome: (suggestion) => suggestionNode(suggestion, h),
          }),
      }),
      Option.match(draftFor(edit, line.id), {
        onNone: () => rowActions(line, canWrite, h),
        onSome: (draft) => editForm(draft, h),
      }),
    ]
  );

const notice = (
  edit: LineEditStateValue,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.p(
    [
      h.AriaLive("polite"),
      h.Class(className(listStyles.notice)),
      h.Role(LineEditState.guards.Failed(edit) ? "alert" : "status"),
    ],
    [editNotice(edit)]
  );

const lines = (
  list: LineListValue,
  edit: LineEditStateValue,
  suggestions: Option.Option<SuggestionsValue>,
  canWrite: boolean,
  emptyText: string,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  LineList.match<Html>(list, {
    Failed: ({ reason }) =>
      h.div(
        [h.Class(className(styles.placeholder))],
        [
          h.p([h.Role("alert")], [reason]),
          strongButton("Try again", Message.Retried(), h),
        ]
      ),
    Loading: () => h.p([h.Role("status")], ["Loading bank lines…"]),
    Ready: ({ lines: rows }) =>
      rows.length === 0
        ? h.p([h.Class(className(styles.secondaryNote))], [emptyText])
        : h.ul(
            [h.Class(className(listStyles.rows))],
            rows.map((line) => lineRow(line, edit, suggestions, canWrite, h))
          ),
  });

const suggestionsPanel = (
  suggestions: SuggestionsValue,
  canWrite: boolean,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.div(
    [h.Class(className(listStyles.panel))],
    [
      h.p(
        [h.Class(className(styles.secondaryNote))],
        [
          "The demo sorter stands in for a language model. It reads the merchant and the description, and offers a category only above its confidence bar.",
        ]
      ),
      Option.match(acceptanceNotice(suggestions), {
        onNone: () => null,
        onSome: (text) =>
          h.p(
            [
              h.AriaLive("polite"),
              h.Class(className(listStyles.notice)),
              h.Role(
                Suggestions.guards.Failed(suggestions) ? "alert" : "status"
              ),
            ],
            [text]
          ),
      }),
      canWrite
        ? h.div(
            [h.Class(className(listStyles.editActions))],
            [
              strongButton(
                "Suggest categories",
                Message.RequestedSuggestions(),
                h,
                Suggestions.guards.Accepting(suggestions) ||
                  Suggestions.guards.Asking(suggestions)
              ),
              strongButton(
                "Accept every suggestion",
                Message.AcceptedSuggestions(),
                h,
                !Suggestions.guards.Ready(suggestions)
              ),
            ]
          )
        : null,
    ]
  );

const searchBox = (
  search: string,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.input([
    h.Id("bank-line-search"),
    h.Name("bank-line-search"),
    h.AriaLabel("Search bank lines"),
    h.Class(
      stylex.props(listStyles.searchInput, listStyles.focus).className ?? ""
    ),
    h.OnInput((value: string) => Message.TypedSearch({ value })),
    h.Placeholder("Merchant, description, reference or note"),
    h.Maxlength(SEARCH_MAX_LENGTH),
    h.Type("search"),
    h.Value(search),
  ]);

const browseScreen = (
  screen: Extract<BankLinesScreenValue, { readonly _tag: "Browse" }>,
  canWrite: boolean,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.section))],
    [
      h.p(
        [h.Class(className(styles.secondaryNote)), h.Role("note")],
        [
          LineScope.match<string>(screen.scope, {
            All: () =>
              "Every line the demo sync wrote, newest first. Mark one reviewed when it is counted.",
            Category: () =>
              "Every line in this category. Mark one reviewed here when it is counted.",
          }),
        ]
      ),
      searchBox(screen.search, h),
      notice(screen.edit, h),
      lines(
        screen.list,
        screen.edit,
        Option.none(),
        canWrite,
        "No bank line matches this search.",
        h
      ),
    ]
  );

const reviewScreen = (
  screen: Extract<BankLinesScreenValue, { readonly _tag: "Review" }>,
  canWrite: boolean,
  h: HtmlBuilder<BankLinesMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.section))],
    [
      h.p(
        [h.Class(className(styles.secondaryNote)), h.Role("note")],
        [
          "Lines with no category yet, newest first. Tagging a line reviewed does not give it a category.",
        ]
      ),
      suggestionsPanel(screen.suggestions, canWrite, h),
      notice(screen.edit, h),
      lines(
        screen.list,
        screen.edit,
        Option.some(screen.suggestions),
        canWrite,
        "Every bank line carries a category.",
        h
      ),
    ]
  );

const title = (screen: BankLinesScreenValue): string =>
  BankLinesScreen.match<string>(screen, {
    Browse: ({ scope }) =>
      LineScope.match<string>(scope, {
        All: () => "Transactions",
        Category: ({ categoryId }) =>
          categoryNameOf(demoCatalogue, Option.some(categoryId)),
      }),
    Review: () => "Review",
  });

export interface BankLinesInputs {
  readonly canWrite: boolean;
}

export const view = Submodel.defineView<
  BankLinesScreenValue,
  BankLinesMessageValue,
  BankLinesInputs
>((screen, viewInputs, h) =>
  h.section(
    [h.AriaLabel(title(screen)), h.Class(className(styles.section))],
    [
      h.h1([h.Class(className(styles.pageTitle))], [title(screen)]),
      BankLinesScreen.match<Html>(screen, {
        Browse: (browse) => browseScreen(browse, viewInputs.canWrite, h),
        Review: (review) => reviewScreen(review, viewInputs.canWrite, h),
      }),
    ]
  )
);
