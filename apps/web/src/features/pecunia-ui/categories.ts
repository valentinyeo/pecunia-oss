import { Head, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import type { CategoryReference, PeriodChoice } from "@pecunia/reporting";
import { PeriodChoiceSchema } from "@pecunia/reporting";
import { Match, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import {
  ReadCategoriesQuery,
  ReadSpendingQuery,
} from "../../client/pecunia-ui/queries.js";
import { formatMinor } from "../pecunia/money-format.js";
import { pecuniaUiStyles, styles, sx } from "./styles.js";

const PeriodPresetSchema = Schema.Literals(["All", "Year", "Quarter", "Month"]);

type PeriodPreset = typeof PeriodPresetSchema.Type;

const presets: readonly {
  readonly id: PeriodPreset;
  readonly label: string;
}[] = [
  { id: "All", label: "All time" },
  { id: "Year", label: "Year" },
  { id: "Quarter", label: "Quarter" },
  { id: "Month", label: "Month" },
];

const periodChoiceOf = (preset: PeriodPreset): PeriodChoice =>
  Match.value(preset).pipe(
    Match.when("All", () => PeriodChoiceSchema.cases.All.make({})),
    Match.when("Year", () => PeriodChoiceSchema.cases.Year.make({})),
    Match.when("Quarter", () => PeriodChoiceSchema.cases.Quarter.make({})),
    Match.when("Month", () => PeriodChoiceSchema.cases.Month.make({})),
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

export const CategoriesMessage = UiSchema.TaggedEnum({
  ClickedPeriod: { preset: PeriodPresetSchema },
});

export const CategoriesPage = Html.component({
  message: CategoriesMessage,
  model: Schema.Struct({ preset: PeriodPresetSchema }),
  name: "CategoriesPage",
  props: Schema.Struct({ profileId: Schema.String }),
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
  head: () => [Head.title("Categories")],
  init: () => ({ preset: "All" }),
  update: ($, message) =>
    CategoriesMessage.match(message, {
      ClickedPeriod: ({ preset }) => $.evolve({ preset }),
    }),
  view: (h, model) =>
    h.section
      .attr("aria-label", "Categories")
      .class(sx(styles.section, pecuniaUiStyles.stack))
      .children(
        h.div.class(sx(pecuniaUiStyles.toolbar)).children(
          h.h1.class(sx(styles.pageTitle)).children("Categories"),
          h.div
            .attr("aria-label", "Period")
            .attr("role", "group")
            .class(sx(pecuniaUiStyles.actionRow))
            .children(
              presets.map((option) =>
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
                    CategoriesMessage.ClickedPeriod({ preset: option.id })
                  )
                  .children(option.label)
              )
            )
        ),
        AsyncResult.match(h.queries.spending, {
          onFailure: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Could not load spend split."),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading spending split…"),
          onSuccess: ({ value: spending }) =>
            h.ul.class(sx(styles.cardGrid)).children(
              spending.split.map((entry) =>
                h.li
                  .key(entry.bucket)
                  .class(sx(styles.card))
                  .children(
                    h.span
                      .class(sx(styles.cardLabel))
                      .children(
                        `${entry.bucket} · ${(entry.shareBasisPoints / 100).toFixed(1)}%`
                      ),
                    h.p
                      .class(sx(styles.cardValue))
                      .children(
                        formatMinor(entry.spendMinor, spending.totals.currency)
                      )
                  )
              )
            ),
        }),
        AsyncResult.match(h.queries.categories, {
          onFailure: ({ cause }) =>
            h.p
              .attr("role", "alert")
              .class(sx(pecuniaUiStyles.feedback))
              .children(`Could not load categories: ${String(cause)}`),
          onInitial: () =>
            h.p
              .class(sx(pecuniaUiStyles.muted))
              .children("Loading categories…"),
          onSuccess: ({ value: report }) =>
            h.div.class(sx(styles.card)).children(
              h.h2
                .class(sx(styles.sectionTitle))
                .children(`Spend across ${report.categoryCount} categories`),
              report.categories.length === 0
                ? h.p
                    .class(sx(pecuniaUiStyles.muted))
                    .children("No categorised spend in this period.")
                : h.table.class(sx(pecuniaUiStyles.table)).children(
                    h.thead.children(
                      h.tr.children(
                        h.th
                          .class(sx(pecuniaUiStyles.tableHeader))
                          .children("Category"),
                        h.th
                          .class(sx(pecuniaUiStyles.tableHeader))
                          .children("Share"),
                        h.th
                          .class(
                            sx(
                              pecuniaUiStyles.tableHeader,
                              pecuniaUiStyles.tableCellRight
                            )
                          )
                          .children("Spend")
                      )
                    ),
                    h.tbody.children(
                      report.categories.map((row) => {
                        const label = categoryLabelOf(row.category);

                        return h.tr
                          .key(label)
                          .children(
                            h.td
                              .class(sx(pecuniaUiStyles.tableCell))
                              .children(label),
                            h.td
                              .class(sx(pecuniaUiStyles.tableCell))
                              .children(
                                `${(row.shareBasisPoints / 100).toFixed(1)}%`
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
                                  row.spendMinor,
                                  report.totals.currency
                                )
                              )
                          );
                      })
                    )
                  )
            ),
        })
      ),
});
