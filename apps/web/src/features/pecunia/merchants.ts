import { normalizeName } from "@pecunia/categorize";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import {
  MERCHANT_LIMIT,
  filterMerchants,
  listedMerchants,
  merchantRows,
} from "../../client/pecunia/categorize/catalog.js";
import { Message } from "../../client/pecunia/categorize/message.js";
import type { CategorizeMessageValue } from "../../client/pecunia/categorize/message.js";
import {
  merchantFilterOf,
  merchantFilterValue,
} from "../../client/pecunia/categorize/model.js";
import type { CategorizeScreenValue } from "../../client/pecunia/categorize/model.js";
import { dayLabel } from "../../client/pecunia/categorize/period.js";
import { merchantsRouter } from "../../client/pecunia/route.js";
import {
  moneyText,
  noticeView,
  pageNote,
  sectionBlock,
  selectField,
  table,
  textField,
} from "./categorize-parts.js";
import { categorizeStyles as styles } from "./categorize.stylex.js";
import { styles as pageStyles } from "./pecunia.stylex.js";

const className = (style: stylex.StyleXStyles): string =>
  stylex.props(style).className ?? "";

const filterOptions = (
  screen: CategorizeScreenValue
): readonly Readonly<{ label: string; value: string }>[] => [
  { label: "Every merchant", value: "all" },
  { label: "No category yet", value: "uncategorised" },
  ...screen.catalog.categories
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({ label: category.name, value: category.id })),
];

const categoryOptions = (
  screen: CategorizeScreenValue
): readonly Readonly<{ label: string; value: string }>[] => [
  { label: "No category", value: "" },
  ...screen.catalog.categories
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({ label: category.name, value: category.id })),
];

const merchantTable = (
  screen: CategorizeScreenValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const all = merchantRows(screen.catalog);
  const query = normalizeName(screen.merchantQuery);

  const narrowed = filterMerchants(all, screen.merchantFilter).filter(
    (row) => query.length === 0 || normalizeName(row.label).includes(query)
  );

  const listed = listedMerchants(narrowed);

  return table(
    {
      head: [
        "Merchant",
        "Payments",
        "Total spent",
        "Most recent",
        "Rule",
        "Category",
      ],
      rows: listed.map((row) => ({
        cells: [
          {
            content: h.a(
              [
                h.Href(`${merchantsRouter()}/${encodeURIComponent(row.key)}`),
                h.Class(
                  stylex.props(styles.link, styles.focus).className ?? ""
                ),
              ],
              [row.label]
            ),
          },
          { content: String(row.count), end: true },
          { content: moneyText(row.totalMinor), end: true },
          { content: dayLabel(row.latestAt) },
          {
            content: Option.match(row.coveringRule, {
              onNone: () => "No rule yet",
              onSome: (rule) => `Rule: ${rule.pattern}`,
            }),
          },
          {
            content: h.select(
              [
                h.AriaLabel(`Category for ${row.label}`),
                h.Value(
                  row.categoryIds.length === 1 ? (row.categoryIds[0] ?? "") : ""
                ),
                h.OnChange((value) =>
                  Message.AssignedMerchantCategory({
                    categoryId: value,
                    key: row.key,
                  })
                ),
                h.Class(
                  stylex.props(styles.fieldInput, styles.focus).className ?? ""
                ),
              ],
              (row.categoryIds.length > 1
                ? [
                    { label: "Mixed categories", value: "" },
                    ...categoryOptions(screen),
                  ]
                : categoryOptions(screen)
              ).map((option) =>
                h.option(
                  [
                    h.Key(option.value),
                    h.Value(option.value),
                    h.Selected(
                      option.value ===
                        (row.categoryIds.length === 1
                          ? (row.categoryIds[0] ?? "")
                          : "")
                    ),
                  ],
                  [option.label]
                )
              )
            ),
          },
        ],
        key: row.key,
      })),
    },
    h
  );
};

export const view = Submodel.defineView<
  Readonly<{ key: string; screen: CategorizeScreenValue }>,
  CategorizeMessageValue
>((props, h) => {
  const { screen } = props;
  const all = merchantRows(screen.catalog);
  const narrowed = filterMerchants(all, screen.merchantFilter);

  return h.section(
    [h.AriaLabel("Merchants"), h.Class(className(pageStyles.section))],
    [
      h.h1([h.Class(className(pageStyles.pageTitle))], ["Merchants"]),
      pageNote(
        "The fifteen merchants that took the most money, newest payment shown for each.",
        h
      ),
      noticeView(screen.notice, h),
      h.div(
        [h.Class(className(styles.formRow))],
        [
          selectField(
            {
              id: "merchant-filter",
              label: "Show",
              onChange: (value) =>
                Message.FilteredMerchants({
                  filter: merchantFilterOf(screen.catalog, value),
                }),
              options: filterOptions(screen),
              value: merchantFilterValue(screen.merchantFilter),
            },
            h
          ),
          textField(
            {
              id: "merchant-search",
              label: "Search",
              onInput: (value) => Message.TypedMerchantQuery({ value }),
              value: screen.merchantQuery,
            },
            h
          ),
          h.p(
            [h.Class(className(styles.muted))],
            [`${narrowed.length} of ${all.length} merchants`]
          ),
        ]
      ),
      sectionBlock("Top merchants", [merchantTable(screen, h)], h),
      narrowed.length > MERCHANT_LIMIT
        ? pageNote(
            `Showing the top ${MERCHANT_LIMIT}. Narrow the list to see the rest.`,
            h
          )
        : pageNote("Every merchant in this view is listed.", h),
    ]
  );
});
