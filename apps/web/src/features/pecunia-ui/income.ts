import { Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import type { ClientIncome } from "@pecunia/reporting";
import { Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { ReadIncomeQuery } from "../../client/pecunia-ui/queries.js";
import { formatMinor } from "../pecunia/money-format.js";
import { horizontalShareBar, monthlyBarChart, paletteColor } from "./charts.js";
import type { MonthlyBarPoint } from "./charts.js";
import {
  periodChoiceOf,
  PeriodPresetSchema,
  reportPeriodPresets,
  sharePercentOf,
} from "./period.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

const aggregateMonthlyIncome = (
  clients: readonly ClientIncome[]
): readonly MonthlyBarPoint[] => {
  const byMonth = new Map<string, number>();

  for (const client of clients) {
    for (const entry of client.months) {
      byMonth.set(
        entry.month,
        (byMonth.get(entry.month) ?? 0) + entry.incomeMinor
      );
    }
  }

  return [...byMonth.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([month, amountMinor]) => ({ amountMinor, month }));
};

export const IncomeMessage = UiSchema.TaggedEnum({
  ClickedPeriod: { preset: PeriodPresetSchema },
  SelectedClient: { clientId: Schema.String },
});

export const IncomePage = Html.component({
  message: IncomeMessage,
  model: Schema.Struct({
    clientId: Schema.String,
    preset: PeriodPresetSchema,
  }),
  name: "IncomePage",
  props: Schema.Struct({
    profileId: Schema.String,
  }),
  queries: {
    income: {
      args: ({ model, props }) =>
        props.profileId.length === 0
          ? undefined
          : {
              clientId: model.clientId,
              period: periodChoiceOf(model.preset),
              profileId: props.profileId,
            },
      query: ReadIncomeQuery,
    },
  },
}).make({
  head: () => [Head.title("Income")],
  init: () => ({ clientId: "", preset: "All" }),
  update: ($, message) =>
    IncomeMessage.match(message, {
      ClickedPeriod: ({ preset }) => $.evolve({ preset }),
      SelectedClient: ({ clientId }) => $.evolve({ clientId }),
    }),
  view: (h, model) =>
    h.section
      .attr("aria-label", "Income")
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.div.class(sx(pecuniaUiStyles.toolbar)).children(
          h.h1.class(sx(styles.pageTitle)).children("Income"),
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
                    IncomeMessage.ClickedPeriod({ preset: option.id })
                  )
                  .children(option.label)
              )
            )
        ),
        AsyncResult.match(h.queries.income, {
          onFailure: ({ cause }) =>
            h.p
              .attr("role", "alert")
              .class(sx(pecuniaUiStyles.feedback))
              .children(`Could not load income report: ${String(cause)}`),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading income report…"),
          onSuccess: ({ value: report }) => {
            const monthlySeries = aggregateMonthlyIncome(report.clients);

            return h.div.class(sx(pecuniaUiStyles.stack)).children(
              h.ul.class(sx(styles.cardGrid)).children(
                h.li
                  .key("income")
                  .class(sx(styles.card))
                  .children(
                    h.span
                      .class(sx(styles.cardLabel))
                      .children("Client income"),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(
                        formatMinor(
                          report.totals.incomeMinor,
                          report.totals.currency
                        )
                      )
                  ),
                h.li
                  .key("refunds")
                  .class(sx(styles.card))
                  .children(
                    h.span
                      .class(sx(styles.cardLabel))
                      .children("Refunds (kept separate)"),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(
                        formatMinor(report.refundMinor, report.totals.currency)
                      )
                  ),
                h.li
                  .key("other")
                  .class(sx(styles.card))
                  .children(
                    h.span
                      .class(sx(styles.cardLabel))
                      .children("Other money in"),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(
                        formatMinor(
                          report.totals.otherInMinor,
                          report.totals.currency
                        )
                      )
                  ),
                h.li
                  .key("totalIn")
                  .class(sx(styles.card))
                  .children(
                    h.span
                      .class(sx(styles.cardLabel))
                      .children("Total money in"),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(
                        formatMinor(
                          report.totals.moneyInMinor,
                          report.totals.currency
                        )
                      )
                  )
              ),
              monthlyBarChart(
                h,
                monthlySeries,
                report.totals.currency,
                model.clientId.length > 0
                  ? "Monthly income for selected client"
                  : "Monthly client income",
                "#2a9d8f"
              ),
              h.div.class(sx(styles.card)).children(
                h.div.class(sx(pecuniaUiStyles.toolbar)).children(
                  h.h2
                    .class(sx(styles.sectionTitle))
                    .children("Income by client"),
                  model.clientId.length > 0
                    ? h.button
                        .attr("type", "button")
                        .class(sx(pecuniaUiStyles.button))
                        .on(
                          "click",
                          IncomeMessage.SelectedClient({ clientId: "" })
                        )
                        .children("Show all clients")
                    : null
                ),
                report.clients.length === 0
                  ? h.p
                      .class(sx(pecuniaUiStyles.muted))
                      .children("No client income recorded in this period.")
                  : h.ul.class(sx(styles.barList)).children(
                      report.clients.map((row, index) =>
                        h.li
                          .key(row.client.payeeId)
                          .class(sx(styles.barRow))
                          .children(
                            h.button
                              .attr("type", "button")
                              .class(sx(pecuniaUiStyles.linkButton))
                              .on(
                                "click",
                                IncomeMessage.SelectedClient({
                                  clientId: row.client.payeeId,
                                })
                              )
                              .children(row.client.name),
                            horizontalShareBar(
                              h,
                              row.shareBasisPoints,
                              paletteColor(index)
                            ),
                            h.span
                              .class(sx(styles.barAmount))
                              .children(
                                `${formatMinor(row.incomeMinor, report.totals.currency)} (${sharePercentOf(row.shareBasisPoints)})`
                              )
                          )
                      )
                    )
              )
            );
          },
        })
      ),
});
