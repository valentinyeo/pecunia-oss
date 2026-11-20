import { ruleOrder } from "@pecunia/categorize";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/pecunia/categorize/message.js";
import type { CategorizeMessageValue } from "../../client/pecunia/categorize/message.js";
import {
  RuleForm,
  emptyRuleDraft,
} from "../../client/pecunia/categorize/model.js";
import type {
  CategorizeScreenValue,
  RuleDraft,
  RuleFormValue,
} from "../../client/pecunia/categorize/model.js";
import type { CategorizeRule } from "../../client/pecunia/categorize/snapshot.js";
import {
  button,
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

const amountText = (rule: CategorizeRule): string => {
  const least = Option.getOrNull(rule.minAmount);
  const most = Option.getOrNull(rule.maxAmount);

  if (least !== null && most !== null) {
    return `${moneyText(least)} to ${moneyText(most)}`;
  }

  if (least !== null) {
    return `at least ${moneyText(least)}`;
  }

  return most === null ? "any amount" : `up to ${moneyText(most)}`;
};

const matchTypeLabels: Readonly<Record<CategorizeRule["matchType"], string>> = {
  contains: "contains",
  digits_only: "digits",
  exact: "is",
  prefix: "starts with",
};

const directionLabels: Readonly<Record<CategorizeRule["direction"], string>> = {
  any: "in or out",
  in: "money in",
  out: "money out",
};

const directionText = (rule: CategorizeRule): string =>
  directionLabels[rule.direction];

const categoryChoices = (
  screen: CategorizeScreenValue
): readonly Readonly<{ label: string; value: string }>[] =>
  screen.catalog.categories
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((category) => ({ label: category.name, value: category.id }));

const ruleTable = (
  screen: CategorizeScreenValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const rules = screen.catalog.rules.toSorted(ruleOrder);

  return table(
    {
      head: [
        "Merchant",
        "Pattern",
        "Category",
        "Direction",
        "Amount",
        "Actions",
      ],
      rows: rules.map((rule) => ({
        cells: [
          {
            content:
              rule.matchField === "merchant"
                ? rule.pattern
                : `any ${rule.matchField}`,
          },
          {
            content: `${matchTypeLabels[rule.matchType]} "${rule.pattern}"`,
          },
          {
            content: h.select(
              [
                h.AriaLabel(`Category for ${rule.pattern}`),
                h.Value(rule.categoryId),
                h.OnChange((value) =>
                  Message.MovedRule({ categoryId: value, id: rule.id })
                ),
                h.Class(
                  stylex.props(styles.fieldInput, styles.focus).className ?? ""
                ),
              ],
              categoryChoices(screen).map((choice) =>
                h.option(
                  [
                    h.Key(choice.value),
                    h.Value(choice.value),
                    h.Selected(choice.value === rule.categoryId),
                  ],
                  [choice.label]
                )
              )
            ),
          },
          { content: directionText(rule) },
          { content: amountText(rule) },
          {
            content: h.span(
              [h.Class(className(styles.rowActions))],
              [
                button(
                  {
                    label: `${rule.enabled ? "Turn off" : "Turn on"} rule for ${rule.pattern}`,
                    onClick: Message.ToggledRule({
                      enabled: !rule.enabled,
                      id: rule.id,
                    }),
                  },
                  h
                ),
                button(
                  {
                    label: `Delete rule for ${rule.pattern}`,
                    onClick: Message.DeletedRule({ id: rule.id }),
                  },
                  h
                ),
              ]
            ),
          },
        ],
        key: rule.id,
      })),
    },
    h
  );
};

const ruleForm = (
  screen: CategorizeScreenValue,
  form: RuleFormValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const draft: RuleDraft = RuleForm.match(form, {
    Closed: () => emptyRuleDraft,
    Creating: ({ draft: open }) => open,
  });

  return h.form(
    [
      h.OnSubmit(Message.SubmittedRule()),
      h.Class(className(styles.form)),
      h.AriaLabel("New rule"),
    ],
    [
      h.p([h.Class(className(styles.fieldLabel))], ["New rule"]),
      h.div(
        [h.Class(className(styles.formRow))],
        [
          textField(
            {
              hint: "Matches when a payment's merchant contains this text.",
              id: "rule-pattern",
              label: "Merchant text",
              onInput: (value) =>
                Message.TypedRule({ field: "pattern", value }),
              value: draft.pattern,
            },
            h
          ),
          selectField(
            {
              id: "rule-category",
              label: "Category",
              onChange: (value) =>
                Message.TypedRule({ field: "categoryId", value }),
              options: [
                { label: "Pick a category", value: "" },
                ...categoryChoices(screen),
              ],
              value: draft.categoryId,
            },
            h
          ),
          selectField(
            {
              id: "rule-direction",
              label: "Direction",
              onChange: (value) =>
                Message.TypedRule({ field: "direction", value }),
              options: [
                { label: "Money out", value: "out" },
                { label: "Money in", value: "in" },
                { label: "In or out", value: "any" },
              ],
              value: draft.direction,
            },
            h
          ),
          textField(
            {
              hint: "Optional, in pounds (£): 25 or 25.50.",
              id: "rule-least",
              label: "Least amount",
              onInput: (value) =>
                Message.TypedRule({ field: "minAmount", value }),
              value: draft.minAmount,
            },
            h
          ),
          textField(
            {
              hint: "Optional, in pounds (£): 25 or 25.50.",
              id: "rule-most",
              label: "Most amount",
              onInput: (value) =>
                Message.TypedRule({ field: "maxAmount", value }),
              value: draft.maxAmount,
            },
            h
          ),
        ]
      ),
      h.div(
        [h.Class(className(styles.actions))],
        [
          submitButton("Save rule", h),
          button({ label: "Cancel", onClick: Message.CancelledRule() }, h),
        ]
      ),
    ]
  );
};

export const view = Submodel.defineView<
  Readonly<{ key: string; screen: CategorizeScreenValue }>,
  CategorizeMessageValue
>((props, h) => {
  const { screen } = props;

  return h.section(
    [h.AriaLabel("Rules"), h.Class(className(pageStyles.section))],
    [
      h.h1([h.Class(className(pageStyles.pageTitle))], ["Rules"]),
      pageNote(
        "A rule files every payment whose merchant contains its pattern. The newest rule wins.",
        h
      ),
      noticeView(screen.notice, h),
      h.div(
        [h.Class(className(styles.actions))],
        [
          button(
            {
              label: "Re-apply every rule",
              onClick: Message.AppliedRules(),
            },
            h
          ),
          h.p(
            [h.Class(className(styles.muted))],
            ["Files every payment already stored, not just new ones."]
          ),
        ]
      ),
      sectionBlock("Rules in this book", [ruleTable(screen, h)], h),
      RuleForm.guards.Closed(screen.ruleForm)
        ? button(
            {
              label: "New rule",
              onClick: Message.StartedCreateRule(),
              primary: true,
            },
            h
          )
        : ruleForm(screen, screen.ruleForm, h),
    ]
  );
});
