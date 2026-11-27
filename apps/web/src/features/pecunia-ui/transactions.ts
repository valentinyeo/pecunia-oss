import { Command, Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { PeriodChoiceSchema } from "@pecunia/reporting";
import { Option, Predicate, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import {
  DirectionFilterName,
  EditBankLineCategoryCommand,
  EditBankLineNoteCommand,
  ListBankLinesQuery,
  ReadCategoriesQuery,
  ReviewBankLineCommand,
  ReviewFilterName,
} from "../../client/pecunia-ui/queries.js";
import { formatDay } from "../pecunia/day-format.js";
import { formatMinor } from "../pecunia/money-format.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

const reviewFilters: readonly {
  readonly id: typeof ReviewFilterName.Type;
  readonly label: string;
}[] = [
  { id: "Any", label: "All" },
  { id: "Awaiting", label: "Awaiting review" },
  { id: "Reviewed", label: "Reviewed" },
];

const directionFilters: readonly {
  readonly id: typeof DirectionFilterName.Type;
  readonly label: string;
}[] = [
  { id: "Any", label: "All flow" },
  { id: "out", label: "Out" },
  { id: "in", label: "In" },
];

export const TransactionsMessage = UiSchema.TaggedEnum({
  ChangedCategory: { categoryId: Schema.String, lineId: Schema.String },
  ClickedCancelEdit: {},
  ClickedDirection: { direction: DirectionFilterName },
  ClickedEdit: { lineId: Schema.String, note: Schema.String },
  ClickedFilter: { review: ReviewFilterName },
  ClickedReview: { lineId: Schema.String },
  FailedMutation: { message: Schema.String },
  SubmittedNote: {},
  SucceededMutation: { message: Schema.String },
  UpdatedNoteDraft: { value: Schema.String },
  UpdatedSearch: { value: Schema.String },
});

export const TransactionsPage = Html.component({
  message: TransactionsMessage,
  model: Schema.Struct({
    direction: DirectionFilterName,
    editingId: Schema.NullOr(Schema.String),
    feedback: Schema.NullOr(Schema.String),
    noteDraft: Schema.String,
    review: ReviewFilterName,
    search: Schema.String,
  }),
  name: "TransactionsPage",
  props: Schema.Struct({
    initialReview: ReviewFilterName,
    profileId: Schema.String,
    title: Schema.String,
  }),
  queries: {
    categories: {
      args: ({ props }) =>
        props.profileId.length === 0
          ? undefined
          : {
              period: PeriodChoiceSchema.cases.All.make({}),
              profileId: props.profileId,
            },
      query: ReadCategoriesQuery,
    },
    page: {
      args: ({ model, props }) =>
        props.profileId.length === 0
          ? undefined
          : {
              direction: model.direction,
              profileId: props.profileId,
              review: model.review,
              search: model.search,
            },
      debounce: "150 millis",
      query: ListBankLinesQuery,
    },
  },
}).make({
  head: ({ props }) => [Head.title(props.title)],
  init: ({ props }) => ({
    direction: "Any",
    editingId: null,
    feedback: null,
    noteDraft: "",
    review: props.initialReview,
    search: "",
  }),
  update: ($, message) =>
    TransactionsMessage.match(message, {
      ChangedCategory: ({ categoryId, lineId }) =>
        $.evolve({ feedback: null }).run(
          EditBankLineCategoryCommand.make({
            categoryId,
            lineId,
            profileId: $.props.profileId,
          }).pipe(
            Command.match({
              onFailure: (error) =>
                TransactionsMessage.FailedMutation({ message: error.message }),
              onSuccess: () =>
                TransactionsMessage.SucceededMutation({
                  message: "Category updated in D1.",
                }),
            })
          )
        ),
      ClickedCancelEdit: () => $.evolve({ editingId: null, noteDraft: "" }),
      ClickedDirection: ({ direction }) =>
        $.evolve({ direction, feedback: null }),
      ClickedEdit: ({ lineId, note }) =>
        $.evolve({ editingId: lineId, feedback: null, noteDraft: note }),
      ClickedFilter: ({ review }) => $.evolve({ feedback: null, review }),
      ClickedReview: ({ lineId }) =>
        $.evolve({ feedback: null }).run(
          ReviewBankLineCommand.make({
            lineId,
            profileId: $.props.profileId,
          }).pipe(
            Command.match({
              onFailure: (error) =>
                TransactionsMessage.FailedMutation({ message: error.message }),
              onSuccess: () =>
                TransactionsMessage.SucceededMutation({
                  message: "Marked reviewed and saved to D1.",
                }),
            })
          )
        ),
      FailedMutation: ({ message: text }) => $.evolve({ feedback: text }),
      SubmittedNote: () => {
        const lineId = $.model.editingId;

        if (lineId === null) {
          return $.model;
        }

        return $.evolve({ editingId: null, feedback: null }).run(
          EditBankLineNoteCommand.make({
            lineId,
            note: $.model.noteDraft,
            profileId: $.props.profileId,
          }).pipe(
            Command.match({
              onFailure: (error) =>
                TransactionsMessage.FailedMutation({ message: error.message }),
              onSuccess: () =>
                TransactionsMessage.SucceededMutation({
                  message: "Note saved to D1.",
                }),
            })
          )
        );
      },
      SucceededMutation: ({ message: text }) => $.evolve({ feedback: text }),
      UpdatedNoteDraft: ({ value }) => $.evolve({ noteDraft: value }),
      UpdatedSearch: ({ value }) => $.evolve({ search: value }),
    }),
  view: (h, model) => {
    const categoryOptions = AsyncResult.isSuccess(h.queries.categories)
      ? h.queries.categories.value.categories.flatMap((row) =>
          Predicate.isTagged(row.category, "Categorised")
            ? [{ id: row.category.categoryId, name: row.category.name }]
            : []
        )
      : [];

    return h.section
      .attr("aria-label", h.props.title)
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.div.class(sx(pecuniaUiStyles.toolbar)).children(
          h.h1.class(sx(styles.pageTitle)).children(h.props.title),
          h.div.class(sx(pecuniaUiStyles.actionRow)).children(
            h.input
              .attr("aria-label", "Search bank lines")
              .attr("placeholder", "Search merchant, description, note…")
              .attr("type", "search")
              .class(sx(pecuniaUiStyles.input))
              .value(model.search)
              .on("input", ({ value }) =>
                TransactionsMessage.UpdatedSearch({ value })
              ),
            ...directionFilters.map((choice) =>
              h.button
                .key(`dir:${choice.id}`)
                .attr("type", "button")
                .attr("aria-pressed", String(model.direction === choice.id))
                .class(
                  sx(
                    pecuniaUiStyles.button,
                    model.direction === choice.id &&
                      pecuniaUiStyles.buttonActive
                  )
                )
                .on(
                  "click",
                  TransactionsMessage.ClickedDirection({
                    direction: choice.id,
                  })
                )
                .children(choice.label)
            ),
            ...reviewFilters.map((choice) =>
              h.button
                .key(`rev:${choice.id}`)
                .attr("type", "button")
                .attr("aria-pressed", String(model.review === choice.id))
                .class(
                  sx(
                    pecuniaUiStyles.button,
                    model.review === choice.id && pecuniaUiStyles.buttonActive
                  )
                )
                .on(
                  "click",
                  TransactionsMessage.ClickedFilter({ review: choice.id })
                )
                .children(choice.label)
            )
          )
        ),
        model.feedback === null
          ? null
          : h.p
              .attr("role", "status")
              .class(sx(pecuniaUiStyles.feedback))
              .children(model.feedback),
        AsyncResult.match(h.queries.page, {
          onFailure: ({ cause }) =>
            h.p
              .attr("role", "alert")
              .class(sx(pecuniaUiStyles.feedback))
              .children(`Could not load transactions: ${String(cause)}`),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading bank lines…"),
          onSuccess: ({ value: page }) =>
            page.lines.length === 0
              ? h.p
                  .class(sx(pecuniaUiStyles.muted))
                  .children("No bank line matches this search or filter.")
              : h.table.class(sx(pecuniaUiStyles.table)).children(
                  h.thead.children(
                    h.tr.children(
                      h.th
                        .class(sx(pecuniaUiStyles.tableHeader))
                        .children("Date"),
                      h.th
                        .class(sx(pecuniaUiStyles.tableHeader))
                        .children("Description"),
                      h.th
                        .class(sx(pecuniaUiStyles.tableHeader))
                        .children("Category"),
                      h.th
                        .class(sx(pecuniaUiStyles.tableHeader))
                        .children("Review"),
                      h.th
                        .class(
                          sx(
                            pecuniaUiStyles.tableHeader,
                            pecuniaUiStyles.tableCellRight
                          )
                        )
                        .children("Amount"),
                      h.th
                        .class(sx(pecuniaUiStyles.tableHeader))
                        .children("Actions")
                    )
                  ),
                  h.tbody.children(
                    page.lines.map((line) => {
                      const reviewed = Predicate.isTagged(
                        line.review,
                        "Reviewed"
                      );

                      const title =
                        line.raw.merchant.length > 0
                          ? line.raw.merchant
                          : line.raw.description;

                      const isEditing = model.editingId === line.id;

                      const currentCategoryId = Option.getOrElse(
                        line.category,
                        () => ""
                      );

                      const hasCurrentInOptions =
                        currentCategoryId.length === 0 ||
                        categoryOptions.some(
                          (option) => option.id === currentCategoryId
                        );

                      return h.tr.key(line.id).children(
                        h.td
                          .class(sx(pecuniaUiStyles.tableCell))
                          .children(formatDay(line.valueDate)),
                        h.td.class(sx(pecuniaUiStyles.tableCell)).children(
                          h.span.class(sx(styles.accountName)).children(title),
                          line.raw.description.length > 0 &&
                            line.raw.description !== title
                            ? h.span
                                .class(sx(pecuniaUiStyles.rowMeta))
                                .children(line.raw.description)
                            : null,
                          line.note.length > 0
                            ? h.span
                                .class(sx(pecuniaUiStyles.rowMeta))
                                .children(`Note: ${line.note}`)
                            : null,
                          isEditing
                            ? h.form
                                .class(sx(pecuniaUiStyles.actionRow))
                                .on(
                                  "submit",
                                  TransactionsMessage.SubmittedNote()
                                )
                                .children(
                                  h.input
                                    .attr("aria-label", "Edit note")
                                    .attr("type", "text")
                                    .class(sx(pecuniaUiStyles.input))
                                    .value(model.noteDraft)
                                    .on("input", ({ value }) =>
                                      TransactionsMessage.UpdatedNoteDraft({
                                        value,
                                      })
                                    ),
                                  h.button
                                    .attr("type", "submit")
                                    .class(
                                      sx(
                                        pecuniaUiStyles.button,
                                        pecuniaUiStyles.buttonPrimary
                                      )
                                    )
                                    .children("Save note"),
                                  h.button
                                    .attr("type", "button")
                                    .class(sx(pecuniaUiStyles.button))
                                    .on(
                                      "click",
                                      TransactionsMessage.ClickedCancelEdit()
                                    )
                                    .children("Cancel")
                                )
                            : null
                        ),
                        h.td.class(sx(pecuniaUiStyles.tableCell)).children(
                          h.select
                            .attr("aria-label", `Category for ${title}`)
                            .class(sx(pecuniaUiStyles.profileSelect))
                            .value(currentCategoryId)
                            .on("change", ({ value }) =>
                              TransactionsMessage.ChangedCategory({
                                categoryId: value,
                                lineId: line.id,
                              })
                            )
                            .children(
                              h.option
                                .attr("value", "")
                                .children("Uncategorised"),
                              hasCurrentInOptions
                                ? null
                                : h.option
                                    .attr("value", currentCategoryId)
                                    .children("Assigned category"),
                              ...categoryOptions.map((option) =>
                                h.option
                                  .key(option.id)
                                  .attr("value", option.id)
                                  .children(option.name)
                              )
                            )
                        ),
                        h.td
                          .class(sx(pecuniaUiStyles.tableCell))
                          .children(
                            h.span
                              .class(sx(pecuniaUiStyles.badge))
                              .children(reviewed ? "Reviewed" : "Awaiting")
                          ),
                        h.td
                          .class(
                            sx(
                              pecuniaUiStyles.tableCell,
                              pecuniaUiStyles.tableCellRight
                            )
                          )
                          .children(
                            `${line.direction === "out" ? "-" : ""}${formatMinor(line.amount.minor, line.amount.currency)}`
                          ),
                        h.td.class(sx(pecuniaUiStyles.tableCell)).children(
                          h.div.class(sx(pecuniaUiStyles.actionRow)).children(
                            h.button
                              .attr("type", "button")
                              .class(sx(pecuniaUiStyles.button))
                              .on(
                                "click",
                                TransactionsMessage.ClickedEdit({
                                  lineId: line.id,
                                  note: line.note,
                                })
                              )
                              .children("Edit note"),
                            reviewed
                              ? null
                              : h.button
                                  .attr("type", "button")
                                  .class(sx(pecuniaUiStyles.button))
                                  .on(
                                    "click",
                                    TransactionsMessage.ClickedReview({
                                      lineId: line.id,
                                    })
                                  )
                                  .children("Confirm")
                          )
                        )
                      );
                    })
                  )
                ),
        })
      );
  },
});
