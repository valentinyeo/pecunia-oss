import { Button } from "@foldkit/ui";
import type { BankLine } from "@pecunia/bank-lines/model";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import { lineLabel } from "../../client/pecunia/bank-lines/model.js";
import {
  categoryNameOf,
  demoCatalogue,
} from "../../client/pecunia/catalogue.js";
import { spendingRouter } from "../../client/pecunia/route.js";
import { Message } from "../../client/pecunia/search/message.js";
import type { SearchMessageValue } from "../../client/pecunia/search/message.js";
import {
  Findings,
  SUGGESTION_LIMIT,
} from "../../client/pecunia/search/model.js";
import type {
  FindingsValue,
  SearchModelValue,
  SuggestionValue,
} from "../../client/pecunia/search/model.js";
import { signedAmount } from "./line-amount.js";
import { formatMoney } from "./money-format.js";
import { styles } from "./pecunia.stylex.js";
import { searchStyles } from "./search.stylex.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

const resultList = (
  rows: readonly Html[],
  h: HtmlBuilder<SearchMessageValue>
): Html => h.ul([h.Class(className(searchStyles.resultList))], rows);

const paymentRow = (line: BankLine, h: HtmlBuilder<SearchMessageValue>): Html =>
  h.li(
    [
      h.Key(line.id),
      h.DataAttribute("payment", line.id),
      h.Class(className(searchStyles.result)),
    ],
    [
      Option.match(line.category, {
        onNone: () =>
          h.span(
            [h.Class(className(searchStyles.resultLabel))],
            [lineLabel(line)]
          ),
        onSome: (categoryId) =>
          h.a(
            [
              h.Class(
                stylex.props(searchStyles.resultLabel, searchStyles.focus)
                  .className ?? ""
              ),
              h.Href(spendingRouter({ categoryId })),
            ],
            [lineLabel(line)]
          ),
      }),
      h.span(
        [h.Class(className(searchStyles.resultValue))],
        [
          `${signedAmount(line)} · ${categoryNameOf(demoCatalogue, line.category)}`,
        ]
      ),
    ]
  );

const paymentSection = (
  payments: readonly BankLine[],
  h: HtmlBuilder<SearchMessageValue>
): Html =>
  payments.length === 0
    ? null
    : h.section(
        [h.AriaLabel("Payments")],
        [
          h.h2([h.Class(className(styles.sectionTitle))], ["Payments"]),
          resultList(
            payments.map((line) => paymentRow(line, h)),
            h
          ),
        ]
      );

const categorySection = (
  findings: Extract<FindingsValue, { readonly _tag: "Ready" }>,
  h: HtmlBuilder<SearchMessageValue>
): Html =>
  findings.categories.length === 0
    ? null
    : h.section(
        [h.AriaLabel("Categories")],
        [
          h.h2([h.Class(className(styles.sectionTitle))], ["Categories"]),
          resultList(
            findings.categories.map((choice) =>
              h.li(
                [h.Key(choice.id), h.Class(className(searchStyles.result))],
                [
                  h.a(
                    [
                      h.Class(
                        stylex.props(
                          searchStyles.resultLabel,
                          searchStyles.focus
                        ).className ?? ""
                      ),
                      h.Href(spendingRouter({ categoryId: choice.id })),
                    ],
                    [choice.name]
                  ),
                  h.span(
                    [h.Class(className(searchStyles.resultValue))],
                    ["Spending"]
                  ),
                ]
              )
            ),
            h
          ),
        ]
      );

const holdingSection = (
  findings: Extract<FindingsValue, { readonly _tag: "Ready" }>,
  h: HtmlBuilder<SearchMessageValue>
): Html =>
  findings.holdings.length === 0
    ? null
    : h.section(
        [h.AriaLabel("Holdings")],
        [
          h.h2([h.Class(className(styles.sectionTitle))], ["Holdings"]),
          resultList(
            findings.holdings.map((holding) =>
              h.li(
                [h.Key(holding.id), h.Class(className(searchStyles.result))],
                [
                  h.span(
                    [h.Class(className(searchStyles.resultLabel))],
                    [holding.name]
                  ),
                  h.span(
                    [h.Class(className(searchStyles.resultValue))],
                    [
                      formatMoney({
                        currency: holding.value.currency,
                        minor: holding.value.minor,
                      }),
                    ]
                  ),
                ]
              )
            ),
            h
          ),
        ]
      );

const suggestionButton = (
  suggestion: SuggestionValue,
  h: HtmlBuilder<SearchMessageValue>
): Html =>
  Button.view(
    {
      onClick: Message.PickedSuggestion({ suggestion }),
      toView: ({ button }) =>
        h.button(
          [
            ...button,
            h.Class(
              stylex.props(searchStyles.suggestionButton, searchStyles.focus)
                .className ?? ""
            ),
          ],
          [suggestion.label]
        ),
      type: "button",
    },
    h
  );

const suggestionList = (
  suggestions: readonly SuggestionValue[],
  h: HtmlBuilder<SearchMessageValue>
): Html =>
  suggestions.length === 0
    ? null
    : h.ul(
        [
          h.AriaLabel("Suggestions"),
          h.Class(className(searchStyles.suggestionList)),
        ],
        suggestions.map((suggestion) =>
          h.li([h.Key(suggestion.label)], [suggestionButton(suggestion, h)])
        )
      );

const searchForm = (
  screen: SearchModelValue,
  h: HtmlBuilder<SearchMessageValue>
): Html =>
  h.form(
    [
      h.Class(className(searchStyles.form)),
      h.OnSubmit(Message.SubmittedSearch()),
    ],
    [
      h.input([
        h.Id("everything-search"),
        h.Name("everything-search"),
        h.AriaLabel("Search everything"),
        h.Class(
          stylex.props(searchStyles.input, searchStyles.focus).className ?? ""
        ),
        h.OnInput((value: string) => Message.TypedQuery({ value })),
        h.Placeholder("A merchant, a category or a holding"),
        h.Type("search"),
        h.Value(screen.query),
      ]),
      Button.view(
        {
          toView: ({ button }) =>
            h.button(
              [
                ...button,
                h.Class(
                  stylex.props(searchStyles.submit, searchStyles.focus)
                    .className ?? ""
                ),
              ],
              ["Search"]
            ),
          type: "submit",
        },
        h
      ),
    ]
  );

const findingsNode = (
  findings: FindingsValue,
  h: HtmlBuilder<SearchMessageValue>
): Html =>
  Findings.match<Html>(findings, {
    Empty: ({ query }) =>
      h.p(
        [h.Class(className(searchStyles.empty))],
        [`Nothing matches “${query}”.`]
      ),
    Failed: ({ reason }) =>
      h.div(
        [h.Class(className(styles.placeholder))],
        [
          h.p([h.Role("alert")], [reason]),
          Button.view(
            {
              onClick: Message.Retried(),
              toView: ({ button }) =>
                h.button(
                  [
                    ...button,
                    h.Class(
                      stylex.props(searchStyles.submit, searchStyles.focus)
                        .className ?? ""
                    ),
                  ],
                  ["Try again"]
                ),
              type: "button",
            },
            h
          ),
        ]
      ),
    Idle: () => null,
    Ready: (ready) =>
      h.div(
        [h.Class(className(styles.section))],
        [
          h.p(
            [h.Class(className(styles.secondaryNote))],
            [`Results for “${ready.query}”.`]
          ),
          categorySection(ready, h),
          holdingSection(ready, h),
          paymentSection(ready.payments, h),
        ]
      ),
    Searching: () => h.p([h.Role("status")], ["Searching…"]),
  });

export const view = Submodel.defineView<SearchModelValue, SearchMessageValue>(
  (screen, h) =>
    h.section(
      [h.AriaLabel("Search"), h.Class(className(styles.section))],
      [
        h.h1([h.Class(className(styles.pageTitle))], ["Search"]),
        h.p(
          [h.Class(className(styles.secondaryNote)), h.Role("note")],
          [
            `One box searches payments, merchants, categories and holdings. Suggestions appear while you type, up to ${SUGGESTION_LIMIT}. Every value here is made up.`,
          ]
        ),
        searchForm(screen, h),
        suggestionList(screen.suggestions, h),
        findingsNode(screen.findings, h),
      ]
    )
);
