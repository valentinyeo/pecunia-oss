import * as stylex from "@stylexjs/stylex";
import type { Html, HtmlBuilder } from "foldkit/html";

import type { CategorizeMessageValue } from "../../client/pecunia/categorize/message.js";
import { Notice } from "../../client/pecunia/categorize/model.js";
import type { NoticeValue } from "../../client/pecunia/categorize/model.js";
import { BookCurrency } from "../../client/pecunia/categorize/payment.js";
import type { Minor } from "../../client/pecunia/money.js";
import { categorizeStyles as styles } from "./categorize.stylex.js";
import { formatMinor } from "./money-format.js";

export type CategorizeHtml = Html;

export const className = (style: stylex.StyleXStyles): string =>
  stylex.props(style).className ?? "";

export const moneyText = (minor: Minor): string =>
  formatMinor(minor, BookCurrency);

export const button = (
  config: Readonly<{
    disabled?: boolean;
    label: string;
    onClick: CategorizeMessageValue;
    primary?: boolean;
  }>,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.button(
    [
      h.Type("button"),
      h.OnClick(config.onClick),
      h.Disabled(config.disabled ?? false),
      h.Class(
        stylex.props(
          styles.button,
          config.primary === true && styles.buttonPrimary,
          styles.focus
        ).className ?? ""
      ),
    ],
    [config.label]
  );

export const submitButton = (
  label: string,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.button(
    [
      h.Type("submit"),
      h.Class(
        stylex.props(styles.button, styles.buttonPrimary, styles.focus)
          .className ?? ""
      ),
    ],
    [label]
  );

export const textField = (
  config: Readonly<{
    hint?: string;
    id: string;
    label: string;
    onInput: (value: string) => CategorizeMessageValue;
    value: string;
  }>,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.field))],
    [
      h.label(
        [h.For(config.id), h.Class(className(styles.fieldLabel))],
        [config.label]
      ),
      h.input([
        h.Id(config.id),
        h.Name(config.id),
        h.Type("text"),
        h.Value(config.value),
        h.OnInput(config.onInput),
        h.Class(stylex.props(styles.fieldInput, styles.focus).className ?? ""),
      ]),
      config.hint === undefined
        ? null
        : h.p([h.Class(className(styles.fieldHint))], [config.hint]),
    ]
  );

export const selectField = (
  config: Readonly<{
    id: string;
    label: string;
    onChange: (value: string) => CategorizeMessageValue;
    options: readonly Readonly<{ label: string; value: string }>[];
    value: string;
  }>,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.field))],
    [
      h.label(
        [h.For(config.id), h.Class(className(styles.fieldLabel))],
        [config.label]
      ),
      h.select(
        [
          h.Id(config.id),
          h.Name(config.id),
          h.Value(config.value),
          h.OnChange(config.onChange),
          h.Class(
            stylex.props(styles.fieldInput, styles.focus).className ?? ""
          ),
        ],
        config.options.map((option) =>
          h.option(
            [
              h.Key(option.value),
              h.Value(option.value),
              h.Selected(option.value === config.value),
            ],
            [option.label]
          )
        )
      ),
    ]
  );

export const noticeView = (
  notice: NoticeValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  Notice.match(notice, {
    Done: ({ text }) =>
      h.p(
        [
          h.Role("status"),
          h.AriaLive("polite"),
          h.Class(
            stylex.props(styles.notice, styles.noticeDone).className ?? ""
          ),
        ],
        [text]
      ),
    None: () => null,
    Refused: ({ message }) =>
      h.p(
        [
          h.Role("alert"),
          h.Class(
            stylex.props(styles.notice, styles.noticeRefused).className ?? ""
          ),
        ],
        [message]
      ),
  });

export const sectionBlock = (
  title: string,
  body: readonly Html[],
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.section(
    [h.Class(className(styles.section))],
    [h.h2([h.Class(className(styles.sectionTitle))], [title]), ...body]
  );

export interface Cell {
  readonly content: Html | string;
  readonly end?: boolean;
}

export interface Row {
  readonly cells: readonly Cell[];
  readonly key: string;
}

export const table = (
  config: Readonly<{
    caption?: string;
    head: readonly string[];
    rows: readonly Row[];
  }>,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.tableScroll))],
    [
      h.table(
        [h.Class(className(styles.table))],
        [
          config.caption === undefined
            ? null
            : h.caption([h.Class(className(styles.muted))], [config.caption]),
          h.thead(
            [],
            [
              h.tr(
                [],
                config.head.map((label) =>
                  h.th(
                    [
                      h.Key(label),
                      h.Scope("col"),
                      h.Class(className(styles.cellHead)),
                    ],
                    [label]
                  )
                )
              ),
            ]
          ),
          h.tbody(
            [],
            config.rows.map((row) =>
              h.tr(
                [h.Key(row.key)],
                row.cells.map((cell) =>
                  h.td(
                    [
                      h.Class(
                        stylex.props(
                          styles.cell,
                          cell.end === true && styles.amount
                        ).className ?? ""
                      ),
                    ],
                    [cell.content]
                  )
                )
              )
            )
          ),
        ]
      ),
    ]
  );

export const pageNote = (
  text: string,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => h.p([h.Class(className(styles.muted)), h.Role("note")], [text]);

export const indent = (depth: number): stylex.StyleXStyles => {
  if (depth === 1) {
    return styles.indentOne;
  }

  return depth >= 2 ? styles.indentTwo : null;
};

export const categoryLabel = (
  config: Readonly<{ color: string; depth: number; name: string }>,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.span(
    [h.Class(className(indent(config.depth)))],
    [
      h.span([
        h.AriaHidden(true),
        h.Class(className(styles.dot)),
        h.Style({ backgroundColor: config.color }),
      ]),
      config.name,
    ]
  );
