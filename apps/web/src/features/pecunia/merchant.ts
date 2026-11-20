import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import {
  MERCHANT_PAGE_SIZE,
  merchantMonthlySpend,
  merchantRowOf,
  merchantRows,
  merchantSpendByCategory,
  paged,
  paymentsForMerchant,
} from "../../client/pecunia/categorize/catalog.js";
import { Message } from "../../client/pecunia/categorize/message.js";
import type { CategorizeMessageValue } from "../../client/pecunia/categorize/message.js";
import type { CategorizeScreenValue } from "../../client/pecunia/categorize/model.js";
import { dayLabel } from "../../client/pecunia/categorize/period.js";
import { percentOf } from "../../client/pecunia/categorize/shares.js";
import { minorUnits } from "../../client/pecunia/money.js";
import type { Minor } from "../../client/pecunia/money.js";
import {
  merchantsRouter,
  dashboardRouter,
} from "../../client/pecunia/route.js";
import {
  button,
  moneyText,
  noticeView,
  pageNote,
  sectionBlock,
  submitButton,
  table,
  textField,
} from "./categorize-parts.js";
import { categorizeStyles as styles } from "./categorize.stylex.js";
import { shareOfLargest } from "./chart.js";
import { styles as pageStyles } from "./pecunia.stylex.js";

const className = (style: stylex.StyleXStyles): string =>
  stylex.props(style).className ?? "";

const bar = (
  minor: Minor,
  largest: Minor,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.span(
    [h.Class(className(styles.bar)), h.AriaHidden(true)],
    [
      h.span([
        h.Class(className(styles.barFill)),
        h.Style({
          width: `${Math.max(2, Math.round(shareOfLargest(minor, largest) * 100))}%`,
        }),
      ]),
    ]
  );

const largestOf = (values: readonly Minor[]): Minor => {
  let largest = minorUnits(0);

  for (const value of values) {
    largest = value > largest ? value : largest;
  }

  return largest;
};

const tiles = (
  screen: CategorizeScreenValue,
  key: string,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const row = merchantRowOf(merchantRows(screen.catalog), key);

  return Option.match(row, {
    onNone: () => null,
    onSome: (merchant) =>
      h.ul(
        [h.Class(className(styles.tileGrid))],
        [
          {
            label: "Total spent",
            value: moneyText(merchant.totalMinor),
          },
          { label: "Payments", value: String(merchant.count) },
          {
            label: "To confirm",
            value: String(merchant.awaiting),
          },
          { label: "Most recent", value: dayLabel(merchant.latestAt) },
        ].map((tile) =>
          h.li(
            [h.Key(tile.label), h.Class(className(styles.tile))],
            [
              h.span([h.Class(className(styles.tileLabel))], [tile.label]),
              h.span([h.Class(className(styles.tileValue))], [tile.value]),
            ]
          )
        )
      ),
  });
};

const spendByCategory = (
  screen: CategorizeScreenValue,
  key: string,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const slices = merchantSpendByCategory(screen.catalog, key);

  const largest = largestOf(slices.map((slice) => slice.minor));

  return sectionBlock(
    "Spend by category",
    slices.length === 0
      ? [pageNote("No money out from this merchant yet.", h)]
      : [
          table(
            {
              head: ["Category", "Spent", "Share"],
              rows: slices.map((slice, index) => ({
                cells: [
                  {
                    content: h.span(
                      [h.Class(className(styles.actions))],
                      [slice.label, bar(slice.minor, largest, h)]
                    ),
                  },
                  { content: moneyText(slice.minor), end: true },
                  { content: percentOf(slice.share), end: true },
                ],
                key: `${slice.label}:${index}`,
              })),
            },
            h
          ),
        ],
    h
  );
};

const monthlySpend = (
  screen: CategorizeScreenValue,
  key: string,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const months = merchantMonthlySpend(screen.catalog, key, screen.period, 3);

  const largest = largestOf(months.map((month) => month.minor));

  return sectionBlock(
    "Monthly spend",
    [
      table(
        {
          head: ["Month", "Spent"],
          rows: months.map((month) => ({
            cells: [
              {
                content: h.span(
                  [h.Class(className(styles.actions))],
                  [month.label, bar(month.minor, largest, h)]
                ),
              },
              { content: moneyText(month.minor), end: true },
            ],
            key: month.month,
          })),
        },
        h
      ),
    ],
    h
  );
};

const paymentsTable = (
  screen: CategorizeScreenValue,
  key: string,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const page = paged(paymentsForMerchant(screen.catalog, key), screen.page);

  const categoryOf = (categoryId: string | null): string =>
    categoryId === null
      ? "No category"
      : (screen.catalog.categories.find(
          (category) => category.id === categoryId
        )?.name ?? "No category");

  return sectionBlock(
    "Payments",
    [
      table(
        {
          head: [
            "Day",
            "Description",
            "Reference",
            "Category",
            "Confirmed",
            "Amount",
          ],
          rows: page.items.map((payment) => ({
            cells: [
              { content: dayLabel(payment.occurredAt) },
              { content: payment.description },
              {
                content:
                  payment.reference.length === 0 ? "—" : payment.reference,
              },
              { content: categoryOf(payment.categoryId) },
              { content: payment.reviewed ? "Yes" : "No" },
              { content: moneyText(payment.amountMinor), end: true },
            ],
            key: payment.id,
          })),
        },
        h
      ),
      h.div(
        [h.Class(className(styles.actions))],
        [
          button(
            {
              disabled: page.page <= 1,
              label: "Newer",
              onClick: Message.ChangedPage({ page: page.page - 1 }),
            },
            h
          ),
          h.p(
            [h.Class(className(styles.muted))],
            [
              `${page.page} of ${page.pageCount} · ${page.total} payments, ${MERCHANT_PAGE_SIZE} a page`,
            ]
          ),
          button(
            {
              disabled: page.page >= page.pageCount,
              label: "Older",
              onClick: Message.ChangedPage({ page: page.page + 1 }),
            },
            h
          ),
        ]
      ),
    ],
    h
  );
};

const renameForm = (
  screen: CategorizeScreenValue,
  key: string,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.form(
    [
      h.OnSubmit(Message.SubmittedRename({ key })),
      h.Class(className(styles.form)),
      h.AriaLabel("Rename merchant"),
    ],
    [
      h.p([h.Class(className(styles.fieldLabel))], ["Rename everywhere"]),
      h.div(
        [h.Class(className(styles.formRow))],
        [
          textField(
            {
              hint: "Every payment from this merchant takes the new name.",
              id: "merchant-rename",
              label: "Merchant name",
              onInput: (value) => Message.TypedMerchantRename({ value }),
              value: screen.renameDraft,
            },
            h
          ),
        ]
      ),
      h.div([h.Class(className(styles.actions))], [submitButton("Rename", h)]),
    ]
  );

const notFound = (key: string, h: HtmlBuilder<CategorizeMessageValue>): Html =>
  h.section(
    [h.AriaLabel("Merchant not found"), h.Class(className(pageStyles.section))],
    [
      h.h1([h.Class(className(pageStyles.pageTitle))], ["Merchant not found"]),
      h.p(
        [h.Class(className(pageStyles.placeholder))],
        [
          `No merchant is stored under ${key}. Fix: `,
          h.a([h.Href(merchantsRouter())], ["pick a merchant from the list"]),
          ".",
        ]
      ),
    ]
  );

export const view = Submodel.defineView<
  Readonly<{ key: string; screen: CategorizeScreenValue }>,
  CategorizeMessageValue
>((props, h) => {
  const { key, screen } = props;
  const row = merchantRowOf(merchantRows(screen.catalog), key);

  return Option.match(row, {
    onNone: () => notFound(key, h),
    onSome: (merchant) =>
      h.section(
        [
          h.AriaLabel(`Merchant ${merchant.label}`),
          h.Class(className(pageStyles.section)),
        ],
        [
          h.p(
            [h.Class(className(styles.muted))],
            [
              h.a(
                [
                  h.Href(merchantsRouter()),
                  h.Class(
                    stylex.props(styles.link, styles.focus).className ?? ""
                  ),
                ],
                ["All merchants"]
              ),
              " · ",
              h.a(
                [
                  h.Href(dashboardRouter()),
                  h.Class(
                    stylex.props(styles.link, styles.focus).className ?? ""
                  ),
                ],
                ["Dashboard"]
              ),
            ]
          ),
          h.h1([h.Class(className(pageStyles.pageTitle))], [merchant.label]),
          pageNote(
            "Demo merchant. Every payment and amount here is made up.",
            h
          ),
          noticeView(screen.notice, h),
          tiles(screen, key, h),
          h.div(
            [h.Class(className(styles.actions))],
            [
              button(
                {
                  label: "Confirm every payment",
                  onClick: Message.ConfirmedMerchant({ key }),
                },
                h
              ),
              Option.match(merchant.coveringRule, {
                onNone: () =>
                  h.span(
                    [h.Class(className(styles.muted))],
                    ["No rule covers this merchant yet."]
                  ),
                onSome: (rule) =>
                  h.span(
                    [h.Class(className(styles.muted))],
                    [
                      `Rule ${rule.pattern} files payments to ${screen.catalog.categories.find((category) => category.id === rule.categoryId)?.name ?? "a category"}.`,
                    ]
                  ),
              }),
            ]
          ),
          spendByCategory(screen, key, h),
          monthlySpend(screen, key, h),
          paymentsTable(screen, key, h),
          renameForm(screen, key, h),
        ]
      ),
  });
});
