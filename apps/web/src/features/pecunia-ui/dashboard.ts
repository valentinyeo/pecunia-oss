import { Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import type { CategoryReference, PeriodChoice } from "@pecunia/reporting";
import { PeriodChoiceSchema } from "@pecunia/reporting";
import { Match, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import {
  ReadCategoriesQuery,
  ReadDashboardQuery,
} from "../../client/pecunia-ui/queries.js";
import { formatDay } from "../pecunia/day-format.js";
import { formatMinor } from "../pecunia/money-format.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

const PeriodPresetSchema = Schema.Literals([
  "All",
  "Year",
  "Quarter",
  "Month",
  "Week",
  "Day",
]);

type PeriodPreset = typeof PeriodPresetSchema.Type;

const periodPresets: readonly {
  readonly id: PeriodPreset;
  readonly label: string;
}[] = [
  { id: "All", label: "All time" },
  { id: "Year", label: "Year" },
  { id: "Quarter", label: "Quarter" },
  { id: "Month", label: "Month" },
  { id: "Week", label: "Week" },
  { id: "Day", label: "Today" },
];

const periodChoiceOf = (preset: PeriodPreset): PeriodChoice =>
  Match.value(preset).pipe(
    Match.when("All", () => PeriodChoiceSchema.cases.All.make({})),
    Match.when("Year", () => PeriodChoiceSchema.cases.Year.make({})),
    Match.when("Quarter", () => PeriodChoiceSchema.cases.Quarter.make({})),
    Match.when("Month", () => PeriodChoiceSchema.cases.Month.make({})),
    Match.when("Week", () => PeriodChoiceSchema.cases.Week.make({})),
    Match.when("Day", () => PeriodChoiceSchema.cases.Day.make({})),
    Match.exhaustive
  );

const categoryLabelOf = (category: CategoryReference): string =>
  Match.value(category).pipe(
    Match.tags({
      Categorised: ({ name }) => name,
      Uncategorised: () => "Uncategorised",
    }),
    Match.exhaustive
  );

const sharePercentOf = (basisPoints: number): string =>
  `${(basisPoints / 100).toFixed(1)}%`;

export const DashboardMessage = UiSchema.TaggedEnum({
  ClickedPeriod: { preset: PeriodPresetSchema },
});

export const DashboardPage = Html.component({
  message: DashboardMessage,
  model: Schema.Struct({
    preset: PeriodPresetSchema,
  }),
  name: "DashboardPage",
  props: Schema.Struct({
    profileId: Schema.String,
  }),
  queries: {
    categories: {
      args: ({ model, props }) =>
        props.profileId.length === 0
          ? undefined
          : {
              period: periodChoiceOf(model.preset),
              profileId: props.profileId,
            },
      query: ReadCategoriesQuery,
    },
    dashboard: {
      args: ({ model, props }) =>
        props.profileId.length === 0
          ? undefined
          : {
              period: periodChoiceOf(model.preset),
              profileId: props.profileId,
            },
      query: ReadDashboardQuery,
    },
  },
}).make({
  head: () => [Head.title("Dashboard")],
  init: () => ({ preset: "All" }),
  update: ($, message) =>
    DashboardMessage.match(message, {
      ClickedPeriod: ({ preset }) => $.evolve({ preset }),
    }),
  view: (h, model) =>
    h.section
      .attr("aria-label", "Dashboard")
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.div.class(sx(pecuniaUiStyles.toolbar)).children(
          h.h1.class(sx(styles.pageTitle)).children("Dashboard"),
          h.div
            .attr("aria-label", "Period")
            .attr("role", "group")
            .class(sx(pecuniaUiStyles.actionRow))
            .children(
              periodPresets.map((option) =>
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
                    DashboardMessage.ClickedPeriod({ preset: option.id })
                  )
                  .children(option.label)
              )
            )
        ),
        AsyncResult.match(h.queries.dashboard, {
          onFailure: ({ cause }) =>
            h.p
              .attr("role", "alert")
              .class(sx(pecuniaUiStyles.feedback))
              .children(`Could not load dashboard: ${String(cause)}`),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading dashboard sums from /app/rpc…"),
          onSuccess: ({ value: data }) =>
            h.div.class(sx(pecuniaUiStyles.stack)).children(
              h.ul
                .class(sx(styles.cardGrid))
                .children(
                  h.li
                    .class(sx(styles.card))
                    .children(
                      h.span
                        .class(sx(styles.cardLabel))
                        .children("Net balance"),
                      h.p
                        .class(sx(styles.cardValue))
                        .children(
                          formatMinor(
                            data.balance.totalMinor,
                            data.balance.currency
                          )
                        )
                    ),
                  h.li
                    .class(sx(styles.card))
                    .children(
                      h.span.class(sx(styles.cardLabel)).children("Money in"),
                      h.p
                        .class(sx(styles.cardValue))
                        .children(
                          formatMinor(
                            data.totals.moneyInMinor,
                            data.totals.currency
                          )
                        )
                    ),
                  h.li
                    .class(sx(styles.card))
                    .children(
                      h.span
                        .class(sx(styles.cardLabel))
                        .children("Posted spend"),
                      h.p
                        .class(sx(styles.cardValue))
                        .children(
                          formatMinor(
                            data.totals.spendMinor,
                            data.totals.currency
                          )
                        )
                    ),
                  h.li
                    .class(sx(styles.card))
                    .children(
                      h.span.class(sx(styles.cardLabel)).children("Net"),
                      h.p
                        .class(sx(styles.cardValue))
                        .children(
                          formatMinor(
                            data.totals.netMinor,
                            data.totals.currency
                          )
                        )
                    ),
                  h.li
                    .class(sx(styles.card))
                    .children(
                      h.span.class(sx(styles.cardLabel)).children("Tax owed"),
                      h.p
                        .class(sx(styles.cardValue))
                        .children(
                          formatMinor(data.taxOwed.minor, data.taxOwed.currency)
                        )
                    )
                ),
              h.div.class(sx(styles.card)).children(
                h.h2.class(sx(styles.sectionTitle)).children("Accounts"),
                data.balance.accounts.length === 0
                  ? h.p
                      .class(sx(pecuniaUiStyles.muted))
                      .children("No accounts recorded for this profile yet.")
                  : h.ul.class(sx(styles.accountList)).children(
                      data.balance.accounts.map((account) =>
                        h.li
                          .key(account.accountId)
                          .class(sx(styles.accountRow))
                          .children(
                            h.span
                              .class(sx(styles.accountName))
                              .children(account.name),
                            h.span
                              .class(sx(styles.accountValue))
                              .children(
                                formatMinor(
                                  account.amount.minor,
                                  account.amount.currency
                                )
                              )
                          )
                      )
                    )
              ),
              AsyncResult.match(h.queries.categories, {
                onFailure: () =>
                  h.p
                    .class(sx(pecuniaUiStyles.muted))
                    .children("Category breakdown unavailable."),
                onInitial: () =>
                  h.p
                    .class(sx(pecuniaUiStyles.muted))
                    .children("Loading category breakdown…"),
                onSuccess: ({ value: report }) =>
                  h.div.class(sx(styles.card)).children(
                    h.h2
                      .class(sx(styles.sectionTitle))
                      .children("Spend by category"),
                    report.categories.length === 0
                      ? h.p
                          .class(sx(pecuniaUiStyles.muted))
                          .children("No posted spend in this period.")
                      : h.ul.class(sx(styles.barList)).children(
                          report.categories.map((row) => {
                            const label = categoryLabelOf(row.category);

                            return h.li
                              .key(label)
                              .class(sx(styles.barRow))
                              .children(
                                h.span
                                  .class(sx(styles.barLabel))
                                  .children(label),
                                h.span
                                  .class(sx(pecuniaUiStyles.muted))
                                  .children(
                                    sharePercentOf(row.shareBasisPoints)
                                  ),
                                h.span
                                  .class(sx(styles.barAmount))
                                  .children(
                                    formatMinor(
                                      row.spendMinor,
                                      report.totals.currency
                                    )
                                  )
                              );
                          })
                        )
                  ),
              }),
              h.div.class(sx(styles.card)).children(
                h.h2.class(sx(styles.sectionTitle)).children("Recent payments"),
                data.recentPayments.length === 0
                  ? h.p
                      .class(sx(pecuniaUiStyles.muted))
                      .children("No counted payments in this period.")
                  : h.ul.class(sx(styles.accountList)).children(
                      data.recentPayments.map((payment) =>
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
      ),
});
