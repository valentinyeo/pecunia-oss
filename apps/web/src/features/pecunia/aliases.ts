import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import {
  aliasCandidates,
  aliasGroups,
} from "../../client/pecunia/categorize/catalog.js";
import { Message } from "../../client/pecunia/categorize/message.js";
import type { CategorizeMessageValue } from "../../client/pecunia/categorize/message.js";
import {
  AliasForm,
  emptyAliasDraft,
} from "../../client/pecunia/categorize/model.js";
import type {
  AliasDraft,
  AliasFormValue,
  CategorizeScreenValue,
} from "../../client/pecunia/categorize/model.js";
import type { Row } from "./categorize-parts.js";
import {
  button,
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

const payeeChoices = (
  screen: CategorizeScreenValue
): readonly Readonly<{ label: string; value: string }>[] =>
  screen.catalog.payees
    .toSorted((left, right) => left.name.localeCompare(right.name))
    .map((payee) => ({ label: payee.name, value: payee.id }));

const aliasTable = (
  screen: CategorizeScreenValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const rows: readonly Row[] = aliasGroups(screen.catalog).flatMap(
    (group): readonly Row[] =>
      group.aliases.length === 0
        ? [
            {
              cells: [
                { content: group.payee.name },
                { content: "No aliases yet" },
                { content: "" },
              ],
              key: `none:${group.payee.id}`,
            },
          ]
        : group.aliases.map((alias) => ({
            cells: [
              { content: group.payee.name },
              {
                content: `${alias.matchType === "exact" ? "exactly" : alias.matchType} "${alias.pattern}"`,
              },
              {
                content: h.span(
                  [h.Class(className(styles.rowActions))],
                  [
                    button(
                      {
                        label: `Edit alias ${alias.pattern}`,
                        onClick: Message.StartedEditAlias({ id: alias.id }),
                      },
                      h
                    ),
                    button(
                      {
                        label: `Delete alias ${alias.pattern}`,
                        onClick: Message.DeletedAlias({ id: alias.id }),
                      },
                      h
                    ),
                  ]
                ),
              },
            ],
            key: alias.id,
          }))
  );

  return table(
    { head: ["Merchant", "Statement text it matches", "Actions"], rows },
    h
  );
};

const candidateList = (
  screen: CategorizeScreenValue,
  query: string,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const candidates = aliasCandidates(screen.catalog, query);

  if (candidates.length === 0) {
    return h.p(
      [h.Class(className(styles.muted))],
      ["No merchant matches. Save the alias to create a new merchant."]
    );
  }

  return h.ul(
    [h.Class(className(styles.actions)), h.AriaLabel("Merchant matches")],
    candidates.map((candidate) =>
      h.li(
        [h.Key(candidate.label)],
        [
          h.button(
            [
              h.Type("button"),
              h.OnClick(
                Option.match(candidate.payeeId, {
                  onNone: () =>
                    Message.TypedAlias({
                      field: "payeeName",
                      value: candidate.label,
                    }),
                  onSome: (payeeId) => Message.ChoseAliasPayee({ payeeId }),
                })
              ),
              h.Class(
                stylex.props(styles.button, styles.focus).className ?? ""
              ),
            ],
            [
              Option.isSome(candidate.payeeId)
                ? candidate.label
                : `${candidate.label} (new merchant)`,
            ]
          ),
        ]
      )
    )
  );
};

const chosenNewMerchant = (name: string): string =>
  name.trim().length === 0
    ? "No merchant chosen yet."
    : `Means a new merchant: ${name}`;

const aliasForm = (
  screen: CategorizeScreenValue,
  form: AliasFormValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html => {
  const draft: AliasDraft = AliasForm.match(form, {
    Closed: () => emptyAliasDraft,
    Creating: ({ draft: current }) => current,
    Editing: ({ draft: current }) => current,
  });

  const heading = AliasForm.guards.Editing(form) ? "Edit alias" : "New alias";

  const chosen =
    draft.payeeId === ""
      ? chosenNewMerchant(draft.payeeName)
      : `Means: ${draft.payeeName}`;

  return h.form(
    [
      h.OnSubmit(Message.SubmittedAlias()),
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
              hint: "The text a bank statement shows.",
              id: "alias-pattern",
              label: "Text on the statement",
              onInput: (value) =>
                Message.TypedAlias({ field: "pattern", value }),
              value: draft.pattern,
            },
            h
          ),
          selectField(
            {
              id: "alias-match",
              label: "Match",
              onChange: (value) =>
                Message.TypedAlias({ field: "matchType", value }),
              options: [
                { label: "Contains", value: "contains" },
                { label: "Starts with", value: "prefix" },
                { label: "Exactly", value: "exact" },
              ],
              value: draft.matchType,
            },
            h
          ),
          textField(
            {
              hint: "Search the merchants this book already knows.",
              id: "alias-query",
              label: "Search merchants",
              onInput: (value) => Message.TypedAlias({ field: "query", value }),
              value: draft.query,
            },
            h
          ),
        ]
      ),
      candidateList(screen, draft.query, h),
      h.p([h.Class(className(styles.muted))], [chosen]),
      h.div(
        [h.Class(className(styles.actions))],
        [
          submitButton("Save alias", h),
          button({ label: "Cancel", onClick: Message.CancelledAlias() }, h),
        ]
      ),
    ]
  );
};

const mergeForm = (
  screen: CategorizeScreenValue,
  h: HtmlBuilder<CategorizeMessageValue>
): Html =>
  h.form(
    [
      h.OnSubmit(Message.SubmittedMerge()),
      h.Class(className(styles.form)),
      h.AriaLabel("Combine merchants"),
    ],
    [
      h.p([h.Class(className(styles.fieldLabel))], ["Combine two merchants"]),
      h.p(
        [h.Class(className(styles.muted))],
        ["Every payment and alias of the first merchant moves to the second."]
      ),
      h.div(
        [h.Class(className(styles.formRow))],
        [
          selectField(
            {
              id: "merge-from",
              label: "Merchant to retire",
              onChange: (value) => Message.TypedMerge({ field: "from", value }),
              options: [
                { label: "Pick a merchant", value: "" },
                ...payeeChoices(screen),
              ],
              value: screen.mergeDraft.from,
            },
            h
          ),
          selectField(
            {
              id: "merge-into",
              label: "Merchant to keep",
              onChange: (value) => Message.TypedMerge({ field: "into", value }),
              options: [
                { label: "Pick a merchant", value: "" },
                ...payeeChoices(screen),
              ],
              value: screen.mergeDraft.into,
            },
            h
          ),
        ]
      ),
      h.div(
        [h.Class(className(styles.actions))],
        [submitButton("Combine merchants", h)]
      ),
    ]
  );

export const view = Submodel.defineView<
  Readonly<{ key: string; screen: CategorizeScreenValue }>,
  CategorizeMessageValue
>((props, h) => {
  const { screen } = props;

  return h.section(
    [h.AriaLabel("Aliases"), h.Class(className(pageStyles.section))],
    [
      h.h1([h.Class(className(pageStyles.pageTitle))], ["Aliases"]),
      pageNote(
        "An alias makes the many names a bank prints mean one merchant.",
        h
      ),
      noticeView(screen.notice, h),
      sectionBlock("Aliases in this book", [aliasTable(screen, h)], h),
      AliasForm.guards.Closed(screen.aliasForm)
        ? button(
            {
              label: "New alias",
              onClick: Message.StartedCreateAlias(),
              primary: true,
            },
            h
          )
        : aliasForm(screen, screen.aliasForm, h),
      sectionBlock("Combine merchants", [mergeForm(screen, h)], h),
      pageNote(
        `${screen.catalog.payees.length} merchants and ${screen.catalog.aliases.length} aliases in this book.`,
        h
      ),
    ]
  );
});
