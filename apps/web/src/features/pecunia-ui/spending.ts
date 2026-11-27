import { Command, Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Predicate, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import {
  ReadCategoryPaymentsQuery,
  ReadSpendingQuery,
  ReviewBankLineCommand,
} from "../../client/pecunia-ui/queries.js";
import { formatDay } from "../pecunia/day-format.js";
import { formatMinor } from "../pecunia/money-format.js";
import {
  donutChart,
  horizontalShareBar,
  paletteColor,
  stackedMonthlyChart,
} from "./charts.js";
import {
  categoryLabelOf,
  periodChoiceOf,
  PeriodPresetSchema,
  reportPeriodPresets,
  sharePercentOf,
} from "./period.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

const bucketColors = {
  business: "#1e6091",
  mixed: "#e9c46a",
  personal: "#2a9d8f",
  uncategorised: "#8d99ae",
} as const;

const bucketLabelOf = (bucket: string): string => {
  if (bucket === "business") {
    return "Business";
  }

  if (bucket === "personal") {
    return "Personal";
  }

  if (bucket === "mixed") {
    return "Mixed";
  }

  return "Uncategorised";
};

export const SpendingMessage = UiSchema.TaggedEnum({
  ClearedCategory: {},
  ClickedCategory: { categoryId: Schema.String, name: Schema.String },
  ClickedPeriod: { preset: PeriodPresetSchema },
  ClickedReview: { lineId: Schema.String },
  FailedReview: { message: Schema.String },
  SucceededReview: {},
});

export const SpendingPage = Html.component({
  message: SpendingMessage,
  model: Schema.Struct({
    feedback: Schema.NullOr(Schema.String),
    preset: PeriodPresetSchema,
    selectedCategoryId: Schema.NullOr(Schema.String),
    selectedCategoryName: Schema.NullOr(Schema.String),
  }),
  name: "SpendingPage",
  props: Schema.Struct({
    profileId: Schema.String,
  }),
  queries: {
    categoryPayments: {
      args: ({ model, props }) =>
        props.profileId.length === 0 || model.selectedCategoryId === null
          ? undefined
          : {
              categoryId: model.selectedCategoryId,
              period: periodChoiceOf(model.preset),
              profileId: props.profileId,
            },
      query: ReadCategoryPaymentsQuery,
    },
    spending: {
      args: ({ model, props }) =>
        props.profileId.length === 0
          ? undefined
          : {
              period: periodChoiceOf(model.preset),
              profileId: props.profileId,
            },
      query: ReadSpendingQuery,
    },
  },
}).make({
  head: () => [Head.title("Spending")],
  init: () => ({
    feedback: null,
    preset: "All",
    selectedCategoryId: null,
    selectedCategoryName: null,
  }),
  update: ($, message) =>
    SpendingMessage.match(message, {
      ClearedCategory: () =>
        $.evolve({
          feedback: null,
          selectedCategoryId: null,
          selectedCategoryName: null,
        }),
      ClickedCategory: ({ categoryId, name }) =>
        $.evolve({
          feedback: null,
          selectedCategoryId: categoryId,
          selectedCategoryName: name,
        }),
      ClickedPeriod: ({ preset }) => $.evolve({ feedback: null, preset }),
      ClickedReview: ({ lineId }) =>
        $.evolve({ feedback: null }).run(
          ReviewBankLineCommand.make({
            lineId,
            profileId: $.props.profileId,
          }).pipe(
            Command.match({
              onFailure: (error) =>
                SpendingMessage.FailedReview({ message: error.message }),
              onSuccess: () => SpendingMessage.SucceededReview(),
            })
          )
        ),
      FailedReview: ({ message: text }) => $.evolve({ feedback: text }),
      SucceededReview: () =>
        $.evolve({ feedback: "Payment marked reviewed and saved to D1." }),
    }),
  view: (h, model) =>
    h.section
      .attr("aria-label", "Spending")
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.div.class(sx(pecuniaUiStyles.toolbar)).children(
          h.h1.class(sx(styles.pageTitle)).children("Spending"),
          h.div
            .attr("aria-label", "Period")
            .attr("role", "group")
            .class(sx(pecuniaUiStyles.actionRow))
            .children(
              reportPeriodPresets.map((option) =>
                h.button
                  .key(option.id)
                  .attr("type", "button")
                  .attr("aria-pressed", String(model.preset === option.id))
                  .class(
                    sx(
                      pecuniaUiStyles.button,
                      model.preset === option.id && pecuniaUiStyles.buttonActive
                    )
                  )
                  .on(
                    "click",
                    SpendingMessage.ClickedPeriod({ preset: option.id })
                  )
                  .children(option.label)
              )
            )
        ),
        model.feedback === null
          ? null
          : h.p
              .attr("role", "status")
              .class(sx(pecuniaUiStyles.feedback))
              .children(model.feedback),
        AsyncResult.match(h.queries.spending, {
          onFailure: ({ cause }) =>
            h.p
              .attr("role", "alert")
              .class(sx(pecuniaUiStyles.feedback))
              .children(`Could not load spending report: ${String(cause)}`),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading spending analytics…"),
          onSuccess: ({ value: report }) =>
            h.div.class(sx(pecuniaUiStyles.stack)).children(
              h.ul.class(sx(styles.cardGrid)).children(
                h.li
                  .key("total")
                  .class(sx(styles.card))
                  .children(
                    h.span.class(sx(styles.cardLabel)).children("Total spend"),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(
                        formatMinor(
                          report.totals.spendMinor,
                          report.totals.currency
                        )
                      )
                  ),
                ...report.split.map((entry) =>
                  h.li
                    .key(entry.bucket)
                    .class(sx(styles.card))
                    .children(
                      h.span
                        .class(sx(styles.cardLabel))
                        .children(
                          `${bucketLabelOf(entry.bucket)} · ${sharePercentOf(entry.shareBasisPoints)}`
                        ),
                      h.p
                        .class(sx(styles.cardValue))
                        .children(
                          formatMinor(entry.spendMinor, report.totals.currency)
                        )
                    )
                )
              ),
              h.div.class(sx(pecuniaUiStyles.twoCol)).children(
                donutChart(
                  h,
                  report.split.map((entry) => ({
                    color: bucketColors[entry.bucket] ?? "#1e6091",
                    label: bucketLabelOf(entry.bucket),
                    shareBasisPoints: entry.shareBasisPoints,
                    valueMinor: entry.spendMinor,
                  })),
                  report.totals.currency,
                  "Personal vs business split"
                ),
                stackedMonthlyChart(
                  h,
                  report.stackedMonths,
                  report.totals.currency,
                  "Monthly spend trend"
                )
              ),
              h.div.class(sx(styles.card)).children(
                h.h2
                  .class(sx(styles.sectionTitle))
                  .children("Spend by category (select to drill down)"),
                report.categories.length === 0
                  ? h.p
                      .class(sx(pecuniaUiStyles.muted))
                      .children("No posted spend in this period.")
                  : h.ul.class(sx(styles.barList)).children(
                      report.categories.map((row, index) => {
                        const label = categoryLabelOf(row.category);

                        const categoryId = Predicate.isTagged(
                          row.category,
                          "Categorised"
                        )
                          ? row.category.categoryId
                          : null;

                        return h.li
                          .key(label)
                          .class(sx(styles.barRow))
                          .children(
                            categoryId === null
                              ? h.span
                                  .class(sx(styles.barLabel))
                                  .children(label)
                              : h.button
                                  .attr("type", "button")
                                  .class(sx(pecuniaUiStyles.linkButton))
                                  .on(
                                    "click",
                                    SpendingMessage.ClickedCategory({
                                      categoryId,
                                      name: label,
                                    })
                                  )
                                  .children(label),
                            horizontalShareBar(
                              h,
                              row.shareBasisPoints,
                              paletteColor(index)
                            ),
                            h.span
                              .class(sx(styles.barAmount))
                              .children(
                                `${formatMinor(row.spendMinor, report.totals.currency)} (${sharePercentOf(row.shareBasisPoints)})`
                              )
                          );
                      })
                    )
              ),
              model.selectedCategoryId === null
                ? null
                : h.div.class(sx(styles.card)).children(
                    h.div
                      .class(sx(pecuniaUiStyles.toolbar))
                      .children(
                        h.h2
                          .class(sx(styles.sectionTitle))
                          .children(
                            `${model.selectedCategoryName ?? "Category"} payments`
                          ),
                        h.button
                          .attr("type", "button")
                          .class(sx(pecuniaUiStyles.button))
                          .on("click", SpendingMessage.ClearedCategory())
                          .children("Close drill-down")
                      ),
                    AsyncResult.match(h.queries.categoryPayments, {
                      onFailure: ({ cause }) =>
                        h.p
                          .attr("role", "alert")
                          .class(sx(pecuniaUiStyles.feedback))
                          .children(
                            `Could not load category payments: ${String(cause)}`
                          ),
                      onInitial: () =>
                        h.p
                          .class(sx(pecuniaUiStyles.muted))
                          .children("Loading category payments…"),
                      onSuccess: ({ value: detail }) =>
                        detail.payments.length === 0
                          ? h.p
                              .class(sx(pecuniaUiStyles.muted))
                              .children("No payments in this category.")
                          : h.table.class(sx(pecuniaUiStyles.table)).children(
                              h.thead.children(
                                h.tr.children(
                                  h.th
                                    .class(sx(pecuniaUiStyles.tableHeader))
                                    .children("Date"),
                                  h.th
                                    .class(sx(pecuniaUiStyles.tableHeader))
                                    .children("Merchant"),
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
                                    .children("Review")
                                )
                              ),
                              h.tbody.children(
                                detail.payments.map((payment) =>
                                  h.tr.key(payment.id).children(
                                    h.td
                                      .class(sx(pecuniaUiStyles.tableCell))
                                      .children(
                                        formatDay(
                                          payment.occurredAt.slice(0, 10)
                                        )
                                      ),
                                    h.td
                                      .class(sx(pecuniaUiStyles.tableCell))
                                      .children(
                                        payment.merchant.length > 0
                                          ? payment.merchant
                                          : payment.reference
                                      ),
                                    h.td
                                      .class(
                                        sx(
                                          pecuniaUiStyles.tableCell,
                                          pecuniaUiStyles.tableCellRight
                                        )
                                      )
                                      .children(
                                        formatMinor(
                                          payment.amount.minor,
                                          payment.amount.currency
                                        )
                                      ),
                                    h.td
                                      .class(sx(pecuniaUiStyles.tableCell))
                                      .children(
                                        h.button
                                          .attr("type", "button")
                                          .class(sx(pecuniaUiStyles.button))
                                          .on(
                                            "click",
                                            SpendingMessage.ClickedReview({
                                              lineId: payment.id,
                                            })
                                          )
                                          .children("Confirm")
                                      )
                                  )
                                )
                              )
                            ),
                    })
                  )
            ),
        })
      ),
});
