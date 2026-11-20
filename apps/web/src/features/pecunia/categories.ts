import type { CategoryId } from "@pecunia/categorize";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import {
  categoryCount,
  monthsOf,
  spendByCategory,
} from "../../client/pecunia/categorize/catalog.js";
import { Message } from "../../client/pecunia/categorize/message.js";
import type { CategorizeMessageValue } from "../../client/pecunia/categorize/message.js";
import {
  CATEGORY_COLORS,
  CategoryForm,
  emptyCategoryDraft,
} from "../../client/pecunia/categorize/model.js";
import type {
  CategorizeScreenValue,
  CategoryDraft,
  CategoryFormValue,
} from "../../client/pecunia/categorize/model.js";
import { monthLabel } from "../../client/pecunia/categorize/period.js";
import type { Month } from "../../client/pecunia/categorize/period.js";
import { percentOf } from "../../client/pecunia/categorize/shares.js";
import { descendantIds } from "../../client/pecunia/categorize/tree.js";
import {
  button,
  categoryLabel,
  moneyText,
  noticeView,
  pageNote,
  sectionBlock,
  selectField,
  submitButton,
  table,
  textField,
} from "./categorize-parts.js";
import { categorizeStyles as styles } from "./categorize.stylex.js";
import { styles as pageStyles } from "./pecunia.stylex.js";

const className = (style: stylex.StyleXStyles): string =>
  stylex.props(style).className ?? "";

const monthOptions = (
  catalog: CategorizeScreenValue["catalog"]
): readonly Readonly<{ label: string; value: string }>[] =>
  monthsOf(catalog).map((month: Month) => ({
    label: monthLabel(month),
    value: month,
  }));

const parentOptions = (
  screen: CategorizeScreenValue,
  ownId: Option.Option<CategoryId>
): readonly Readonly<{ label: string; value: string }>[] => {
  const blocked: readonly CategoryId[] = Option.match(ownId, {
    onNone: () => [],
    onSome: (id) => [id, ...descendantIds(screen.catalog.categories, id)],
  });

  return [
    { label: "No parent", value: "" },
    ...screen.catalog.categories
      .filter((category) => !blocked.includes(category.id))
      .map((category) => ({ label: category.name, value: category.id })),
  ];
};

const spendTable = (
  screen: CategorizeScreenValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const rows = spendByCategory(screen.catalog, screen.period);

  return sectionBlock(
    `Spend in ${monthLabel(screen.period)}`,
    [
      table(
        {
          head: ["Category", "Own spend", "With children", "Share"],
          rows: rows.map((row) => ({
            cells: [
              {
                content: categoryLabel(
                  {
                    color: row.category.color,
                    depth: row.depth,
                    name: row.category.name,
                  },
                  h
                ),
              },
              { content: moneyText(row.ownMinor), end: true },
              { content: moneyText(row.totalMinor), end: true },
              {
                content: Option.match(row.share, {
                  onNone: () => "—",
                  onSome: (share) => percentOf(share),
                }),
                end: true,
              },
            ],
            key: row.category.id,
          })),
        },
        h
      ),
      pageNote(
        "A parent category's total includes its children, so only top-level categories show a share.",
        h
      ),
    ],
    h
  );
};

const categoryForm = (
  screen: CategorizeScreenValue,
  form: CategoryFormValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const draft: CategoryDraft = CategoryForm.match(form, {
    Closed: () => emptyCategoryDraft,
    Creating: ({ draft: open }) => open,
    Editing: ({ draft: open }) => open,
  });

  const heading = CategoryForm.guards.Editing(form)
    ? "Edit category"
    : "New category";

  return h.form(
    [
      h.OnSubmit(Message.SubmittedCategory()),
      h.Class(className(styles.form)),
      h.AriaLabel(heading),
    ],
    [
      h.p([h.Class(className(styles.fieldLabel))], [heading]),
      h.div(
        [h.Class(className(styles.formRow))],
        [
          textField(
            {
              id: "category-name",
              label: "Name",
              onInput: (value) =>
                Message.TypedCategory({ field: "name", value }),
              value: draft.name,
            },
            h
          ),
          selectField(
            {
              id: "category-colour",
              label: "Colour",
              onChange: (value) =>
                Message.TypedCategory({ field: "color", value }),
              options: CATEGORY_COLORS.map((color) => ({
                label: color,
                value: color,
              })),
              value: draft.color,
            },
            h
          ),
          selectField(
            {
              id: "category-parent",
              label: "Parent",
              onChange: (value) =>
                Message.TypedCategory({ field: "parentId", value }),
              options: parentOptions(
                screen,
                CategoryForm.guards.Editing(form)
                  ? Option.some(form.id)
                  : Option.none()
              ),
              value: draft.parentId,
            },
            h
          ),
          selectField(
            {
              id: "category-spending",
              label: "Spending",
              onChange: (value) =>
                Message.TypedCategory({ field: "spendingType", value }),
              options: [
                { label: "Personal", value: "personal" },
                { label: "Business", value: "business" },
                { label: "Mixed", value: "mixed" },
              ],
              value: draft.spendingType,
            },
            h
          ),
        ]
      ),
      h.div(
        [h.Class(className(styles.actions))],
        [
          submitButton("Save category", h),
          button({ label: "Cancel", onClick: Message.CancelledCategory() }, h),
        ]
      ),
    ]
  );
};

const managementTable = (
  screen: CategorizeScreenValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  table(
    {
      head: ["Category", "Colour", "Spending", "Actions"],
      rows: screen.catalog.categories
        .toSorted((left, right) => left.name.localeCompare(right.name))
        .map((category) => ({
          cells: [
            { content: category.name },
            { content: category.color },
            { content: category.spendingType },
            {
              content: h.span(
                [h.Class(className(styles.rowActions))],
                [
                  button(
                    {
                      label: `Edit ${category.name}`,
                      onClick: Message.StartedEditCategory({ id: category.id }),
                    },
                    h
                  ),
                  button(
                    {
                      label: `Delete ${category.name}`,
                      onClick: Message.DeletedCategory({ id: category.id }),
                    },
                    h
                  ),
                ]
              ),
            },
          ],
          key: category.id,
        })),
    },
    h
  );

export const view = Submodel.defineView<
  Readonly<{ key: string; screen: CategorizeScreenValue }>,
  CategorizeMessageValue
>((props, h) => {
  const { screen } = props;

  return h.section(
    [h.AriaLabel("Categories"), h.Class(className(pageStyles.section))],
    [
      h.h1([h.Class(className(pageStyles.pageTitle))], ["Categories"]),
      pageNote(
        "Demo book. Every payment and category here is made up for the preview. Deleting a category keeps its rules: a rule whose category is gone stays listed and stops matching until you point it at another category.",
        h
      ),
      noticeView(screen.notice, h),
      h.div(
        [h.Class(className(styles.formRow))],
        [
          selectField(
            {
              id: "category-period",
              label: "Month",
              onChange: (value) => Message.ChangedPeriod({ period: value }),
              options: monthOptions(screen.catalog),
              value: screen.period,
            },
            h
          ),
          h.p(
            [h.Class(className(styles.muted))],
            [`${categoryCount(screen.catalog)} categories in this book`]
          ),
        ]
      ),
      spendTable(screen, h),
      sectionBlock("Manage categories", [managementTable(screen, h)], h),
      CategoryForm.guards.Closed(screen.categoryForm)
        ? button(
            {
              label: "New category",
              onClick: Message.StartedCreateCategory(),
              primary: true,
            },
            h
          )
        : categoryForm(screen, screen.categoryForm, h),
    ]
  );
});
