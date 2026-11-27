import { Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import {
  ListMonthsQuery,
  ReadMonthQuery,
} from "../../client/pecunia-ui/queries.js";
import { formatDay } from "../pecunia/day-format.js";
import { formatMinor } from "../pecunia/money-format.js";
import { dailyBarChart, horizontalShareBar, paletteColor } from "./charts.js";
import { categoryLabelOf, sharePercentOf } from "./period.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

export const MonthsMessage = UiSchema.TaggedEnum({
  IgnoredMonths: {},
  LoadedMonths: { defaultMonth: Schema.String },
  SelectedMonth: { month: Schema.String },
});

export const MonthsPage = Html.component({
  message: MonthsMessage,
  model: Schema.Struct({
    selectedMonth: Schema.String,
  }),
  name: "MonthsPage",
  props: Schema.Struct({
    profileId: Schema.String,
  }),
  queries: {
    months: {
      args: ({ props }) =>
        props.profileId.length === 0
          ? undefined
          : { profileId: props.profileId },
      onChange: (result) =>
        AsyncResult.isSuccess(result) && result.value.months[0] !== undefined
          ? MonthsMessage.LoadedMonths({
              defaultMonth: result.value.months[0],
            })
          : MonthsMessage.IgnoredMonths(),
      query: ListMonthsQuery,
    },
    statement: {
      args: ({ model, props }) =>
        props.profileId.length === 0 || model.selectedMonth.length === 0
          ? undefined
          : {
              month: model.selectedMonth,
              profileId: props.profileId,
            },
      query: ReadMonthQuery,
    },
  },
}).make({
  head: () => [Head.title("Monthly")],
  init: () => ({ selectedMonth: "" }),
  update: ($, message) =>
    MonthsMessage.match(message, {
      IgnoredMonths: () => $.model,
      LoadedMonths: ({ defaultMonth }) =>
        $.model.selectedMonth.length > 0
          ? $.model
          : $.evolve({ selectedMonth: defaultMonth }),
      SelectedMonth: ({ month }) => $.evolve({ selectedMonth: month }),
    }),
  view: (h, model) => {
    const months = AsyncResult.isSuccess(h.queries.months)
      ? h.queries.months.value.months
      : [];

    const activeMonth =
      model.selectedMonth.length > 0 ? model.selectedMonth : (months[0] ?? "");

    const monthNames: readonly string[] = months;
    const currentIndex = monthNames.indexOf(activeMonth);
    const newerMonth = currentIndex > 0 ? months.at(currentIndex - 1) : null;

    const olderMonth =
      currentIndex !== -1 && currentIndex + 1 < months.length
        ? months.at(currentIndex + 1)
        : null;

    const hasNewer = newerMonth !== null && newerMonth !== undefined;
    const hasOlder = olderMonth !== null && olderMonth !== undefined;

    return h.section
      .attr("aria-label", "Monthly statement")
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.div.class(sx(pecuniaUiStyles.toolbar)).children(
          h.h1.class(sx(styles.pageTitle)).children("Monthly"),
          months.length > 0
            ? h.div.class(sx(pecuniaUiStyles.actionRow)).children(
                h.button
                  .attr("type", "button")
                  .attr("disabled", hasOlder ? undefined : "true")
                  .class(sx(pecuniaUiStyles.button))
                  .on(
                    "click",
                    hasOlder
                      ? MonthsMessage.SelectedMonth({ month: olderMonth })
                      : MonthsMessage.IgnoredMonths()
                  )
                  .children("← Older"),
                h.select
                  .attr("aria-label", "Select month")
                  .class(sx(pecuniaUiStyles.profileSelect))
                  .value(activeMonth)
                  .on("change", ({ value }) =>
                    MonthsMessage.SelectedMonth({ month: value })
                  )
                  .children(
                    months.map((month) =>
                      h.option.key(month).attr("value", month).children(month)
                    )
                  ),
                h.button
                  .attr("type", "button")
                  .attr("disabled", hasNewer ? undefined : "true")
                  .class(sx(pecuniaUiStyles.button))
                  .on(
                    "click",
                    hasNewer
                      ? MonthsMessage.SelectedMonth({ month: newerMonth })
                      : MonthsMessage.IgnoredMonths()
                  )
                  .children("Newer →")
              )
            : null
        ),
        months.length === 0 && AsyncResult.isSuccess(h.queries.months)
          ? h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("No posted months recorded for this profile yet.")
          : AsyncResult.match(h.queries.statement, {
              onFailure: ({ cause }) =>
                h.p
                  .attr("role", "alert")
                  .class(sx(pecuniaUiStyles.feedback))
                  .children(
                    `Could not load monthly statement: ${String(cause)}`
                  ),
              onInitial: () =>
                h.p
                  .class(sx(pecuniaUiStyles.muted))
                  .children("Loading monthly statement…"),
              onSuccess: ({ value: statement }) =>
                h.div.class(sx(pecuniaUiStyles.stack)).children(
                  h.ul.class(sx(styles.cardGrid)).children(
                    h.li
                      .key("in")
                      .class(sx(styles.card))
                      .children(
                        h.span.class(sx(styles.cardLabel)).children("Money in"),
                        h.p
                          .class(sx(styles.cardValue))
                          .children(
                            formatMinor(
                              statement.totals.moneyInMinor,
                              statement.totals.currency
                            )
                          )
                      ),
                    h.li
                      .key("spend")
                      .class(sx(styles.card))
                      .children(
                        h.span
                          .class(sx(styles.cardLabel))
                          .children("Posted spend"),
                        h.p
                          .class(sx(styles.cardValue))
                          .children(
                            formatMinor(
                              statement.totals.spendMinor,
                              statement.totals.currency
                            )
                          )
                      ),
                    h.li
                      .key("tax")
                      .class(sx(styles.card))
                      .children(
                        h.span.class(sx(styles.cardLabel)).children("Tax paid"),
                        h.p
                          .class(sx(styles.cardValue))
                          .children(
                            formatMinor(
                              statement.totals.taxMinor,
                              statement.totals.currency
                            )
                          )
                      ),
                    h.li
                      .key("net")
                      .class(sx(styles.card))
                      .children(
                        h.span.class(sx(styles.cardLabel)).children("Net"),
                        h.p
                          .class(sx(styles.cardValue))
                          .children(
                            formatMinor(
                              statement.totals.netMinor,
                              statement.totals.currency
                            )
                          )
                      )
                  ),
                  dailyBarChart(
                    h,
                    statement.dailySpend,
                    statement.totals.currency,
                    `Daily spend in ${statement.month}`
                  ),
                  h.div.class(sx(pecuniaUiStyles.twoCol)).children(
                    h.div.class(sx(styles.card)).children(
                      h.h2
                        .class(sx(styles.sectionTitle))
                        .children("Spend by category"),
                      statement.spendByCategory.length === 0
                        ? h.p
                            .class(sx(pecuniaUiStyles.muted))
                            .children("No spend in this month.")
                        : h.ul.class(sx(styles.barList)).children(
                            statement.spendByCategory.map((row, index) => {
                              const label = categoryLabelOf(row.category);

                              return h.li
                                .key(label)
                                .class(sx(styles.barRow))
                                .children(
                                  h.span
                                    .class(sx(styles.barLabel))
                                    .children(label),
                                  horizontalShareBar(
                                    h,
                                    row.shareBasisPoints,
                                    paletteColor(index)
                                  ),
                                  h.span
                                    .class(sx(styles.barAmount))
                                    .children(
                                      `${formatMinor(row.spendMinor, statement.totals.currency)} (${sharePercentOf(row.shareBasisPoints)})`
                                    )
                                );
                            })
                          )
                    ),
                    h.div.class(sx(styles.card)).children(
                      h.h2
                        .class(sx(styles.sectionTitle))
                        .children("Top merchants"),
                      statement.merchants.length === 0
                        ? h.p
                            .class(sx(pecuniaUiStyles.muted))
                            .children("No merchants paid this month.")
                        : h.ul.class(sx(styles.accountList)).children(
                            statement.merchants.map((merchant) =>
                              h.li
                                .key(merchant.merchant)
                                .class(sx(styles.accountRow))
                                .children(
                                  h.span
                                    .class(sx(styles.accountName))
                                    .children(
                                      `${merchant.merchant} (${merchant.repeatCount}×)`
                                    ),
                                  h.span
                                    .class(sx(styles.accountValue))
                                    .children(
                                      formatMinor(
                                        merchant.spendMinor,
                                        statement.totals.currency
                                      )
                                    )
                                )
                            )
                          )
                    )
                  ),
                  h.div.class(sx(styles.card)).children(
                    h.h2
                      .class(sx(styles.sectionTitle))
                      .children(
                        `Payments in ${statement.month} (${statement.payments.length})`
                      ),
                    statement.payments.length === 0
                      ? h.p
                          .class(sx(pecuniaUiStyles.muted))
                          .children("No counted payments in this month.")
                      : h.ul.class(sx(styles.accountList)).children(
                          statement.payments.map((payment) =>
                            h.li
                              .key(payment.id)
                              .class(sx(styles.accountRow))
                              .children(
                                h.div.children(
                                  h.span
                                    .class(sx(styles.accountName))
                                    .children(
                                      payment.merchant.length > 0
                                        ? payment.merchant
                                        : payment.reference
                                    ),
                                  h.span
                                    .class(sx(pecuniaUiStyles.rowMeta))
                                    .children(
                                      `${formatDay(payment.occurredAt.slice(0, 10))} · ${categoryLabelOf(payment.category)}`
                                    )
                                ),
                                h.span
                                  .class(sx(styles.accountValue))
                                  .children(
                                    formatMinor(
                                      payment.amount.minor,
                                      payment.amount.currency
                                    )
                                  )
                              )
                          )
                        )
                  )
                ),
            })
      );
  },
});
