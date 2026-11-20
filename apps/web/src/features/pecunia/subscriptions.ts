import { Button } from "@foldkit/ui";
import type {
  SubscriptionFilter,
  SubscriptionPage,
  SubscriptionView,
} from "@pecunia/subscriptions";
import * as stylex from "@stylexjs/stylex";
import { Option } from "effect";
import { Submodel } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "../../client/pecunia/subscriptions/message.js";
import type { SubscriptionsMessageValue } from "../../client/pecunia/subscriptions/message.js";
import {
  canCancel,
  canRestore,
  emptyCopy,
  filterOptions,
  frequencyLabel,
  nextChargeShown,
  pageOf,
  rowsOf,
  sameFilter,
  statusChangeNotice,
  statusLabel,
  StatusChangeState,
  SubscriptionList,
} from "../../client/pecunia/subscriptions/model.js";
import type {
  StatusChangeStateValue,
  SubscriptionListValue,
  SubscriptionRoleValue,
  SubscriptionsScreenValue,
} from "../../client/pecunia/subscriptions/model.js";
import { listStyles } from "./bank-lines.stylex.js";
import { formatDay } from "./day-format.js";
import { formatMoney } from "./money-format.js";
import { styles } from "./pecunia.stylex.js";
import { subscriptionsStyles } from "./subscriptions.stylex.js";

const className = (style: stylex.StyleXStyles) =>
  stylex.props(style).className ?? "";

const badge = (
  view: SubscriptionView,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  h.span(
    [
      h.Class(
        stylex.props(
          listStyles.badge,
          canCancel("owner", view) && listStyles.badgeAwaiting
        ).className ?? ""
      ),
    ],
    [statusLabel(view.status)]
  );

const totals = (
  page: SubscriptionPage,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  h.dl(
    [h.Class(className(subscriptionsStyles.totals))],
    [
      h.div(
        [h.Key("monthly")],
        [
          h.dt(
            [h.Class(className(subscriptionsStyles.totalLabel))],
            ["Active monthly"]
          ),
          h.dd(
            [
              h.Class(className(subscriptionsStyles.totalValue)),
              h.DataAttribute("total", "monthly"),
            ],
            [formatMoney(page.activeMonthly)]
          ),
        ]
      ),
      h.div(
        [h.Key("annual")],
        [
          h.dt(
            [h.Class(className(subscriptionsStyles.totalLabel))],
            ["Active yearly"]
          ),
          h.dd(
            [
              h.Class(className(subscriptionsStyles.totalValue)),
              h.DataAttribute("total", "annual"),
            ],
            [formatMoney(page.activeAnnual)]
          ),
        ]
      ),
    ]
  );

const filterButton = (
  filter: SubscriptionFilter,
  label: string,
  current: SubscriptionFilter,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html => {
  const active = sameFilter(filter, current);

  return Button.view(
    {
      onClick: Message.ChoseFilter({ filter }),
      toView: ({ button }) =>
        h.button(
          [
            ...button,
            h.AriaPressed(String(active)),
            h.Class(
              stylex.props(
                subscriptionsStyles.filterButton,
                active && subscriptionsStyles.filterButtonActive,
                subscriptionsStyles.focus
              ).className ?? ""
            ),
          ],
          [label]
        ),
    },
    h
  );
};

const filterGroup = (
  current: SubscriptionFilter,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  h.div(
    [
      h.AriaLabel("Show"),
      h.Class(className(subscriptionsStyles.filterGroup)),
      h.Role("group"),
    ],
    filterOptions.map((option) =>
      filterButton(option.filter, option.label, current, h)
    )
  );

const panel = (
  filter: SubscriptionFilter,
  page: Option.Option<SubscriptionPage>,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  h.div(
    [h.Class(className(subscriptionsStyles.panel))],
    [
      Option.match(page, {
        onNone: () =>
          h.p(
            [h.Role("status"), h.Class(className(styles.secondaryNote))],
            ["Reading the repeat payments…"]
          ),
        onSome: (loaded) => totals(loaded, h),
      }),
      filterGroup(filter, h),
    ]
  );

const notice = (
  status: StatusChangeStateValue,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  h.p(
    [
      h.AriaLive("polite"),
      h.Class(className(listStyles.notice)),
      h.Role(StatusChangeState.guards.Failed(status) ? "alert" : "status"),
    ],
    [statusChangeNotice(status)]
  );

const plainButton = (
  label: string,
  onClick: SubscriptionsMessageValue,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  Button.view(
    {
      onClick,
      toView: ({ button }) =>
        h.button(
          [
            ...button,
            h.Class(
              stylex.props(listStyles.plainButton, listStyles.focus)
                .className ?? ""
            ),
          ],
          [label]
        ),
      type: "button",
    },
    h
  );

const strongButton = (
  label: string,
  onClick: SubscriptionsMessageValue,
  h: HtmlBuilder<SubscriptionsMessageValue>,
  isDisabled = false
): Html =>
  Button.view(
    {
      isDisabled,
      onClick,
      toView: ({ button }) =>
        h.button(
          [
            ...button,
            h.Class(
              stylex.props(
                listStyles.saveButton,
                listStyles.focus,
                isDisabled && listStyles.disabledButton
              ).className ?? ""
            ),
          ],
          [label]
        ),
      type: "button",
    },
    h
  );

const nextChargeNode = (
  view: SubscriptionView,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  Option.match(nextChargeShown(view), {
    onNone: () => h.span([], ["No next charge"]),
    onSome: (day) => h.span([], [`Next charge ${formatDay(day)}`]),
  });

const rowActions = (
  view: SubscriptionView,
  role: SubscriptionRoleValue,
  status: StatusChangeStateValue,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html | null => {
  if (StatusChangeState.guards.Sending(status)) {
    return null;
  }

  return plainButton(
    canCancel(role, view)
      ? `Cancel ${view.payeeName}`
      : `Restore ${view.payeeName}`,
    canCancel(role, view)
      ? Message.RequestedCancel({ subscriptionId: view.id })
      : Message.RequestedRestore({ subscriptionId: view.id }),
    h
  );
};

const row = (
  view: SubscriptionView,
  role: SubscriptionRoleValue,
  prior: SubscriptionsScreenValue["prior"],
  status: StatusChangeStateValue,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html => {
  const actionable = canCancel(role, view) || canRestore(role, prior, view);

  return h.li(
    [
      h.Key(view.id),
      h.DataAttribute("subscription", view.id),
      h.DataAttribute("status", view.status._tag),
      h.Class(className(listStyles.row)),
    ],
    [
      h.div(
        [h.Class(className(subscriptionsStyles.rowHead))],
        [
          h.span(
            [h.Class(className(subscriptionsStyles.rowPayee))],
            [view.payeeName]
          ),
          h.span(
            [h.Class(className(listStyles.rowAmount))],
            [formatMoney(view.cost.monthly)]
          ),
        ]
      ),
      h.div(
        [h.Class(className(subscriptionsStyles.rowMeta))],
        [
          h.span(
            [h.Class(className(subscriptionsStyles.rowFrequency))],
            [
              `${frequencyLabel(view.frequency)} · ${formatMoney(view.cost.annual)} a year`,
            ]
          ),
          h.span([], [`Last charged ${formatDay(view.lastChargedOn)}`]),
          nextChargeNode(view, h),
          h.span(
            [],
            [
              view.occurrenceCount === 1
                ? "1 charge so far"
                : `${view.occurrenceCount} charges so far`,
            ]
          ),
          h.span([], [`${Math.round(view.confidence * 100)}% confidence`]),
          badge(view, h),
        ]
      ),
      h.div(
        [h.Class(className(listStyles.rowActions))],
        [actionable ? rowActions(view, role, status, h) : null]
      ),
    ]
  );
};

const rows = (
  list: SubscriptionListValue,
  role: SubscriptionRoleValue,
  prior: SubscriptionsScreenValue["prior"],
  status: StatusChangeStateValue,
  filter: SubscriptionFilter,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  SubscriptionList.match<Html>(list, {
    Failed: ({ reason }) =>
      h.div(
        [h.Class(className(styles.placeholder))],
        [
          h.p([h.Role("alert")], [reason]),
          strongButton("Try again", Message.Retried(), h),
        ]
      ),
    Loading: () => h.p([h.Role("status")], ["Loading repeat payments…"]),
    Ready: ({ page }) =>
      rowsOf(list).length === 0
        ? h.p([h.Class(className(styles.secondaryNote))], [emptyCopy(filter)])
        : h.ul(
            [h.Class(className(listStyles.rows))],
            page.subscriptions.map((view) => row(view, role, prior, status, h))
          ),
  });

const browsing = (
  screen: SubscriptionsScreenValue,
  role: SubscriptionRoleValue,
  h: HtmlBuilder<SubscriptionsMessageValue>
): Html =>
  h.div(
    [h.Class(className(styles.section))],
    [
      h.p(
        [h.Class(className(styles.secondaryNote)), h.Role("note")],
        [
          "Demo repeat payments. Every value is made up, and the subscriptions service runs in memory for this preview. Monthly is the yearly cost divided by twelve and rounded down, so the rows add up.",
        ]
      ),
      panel(screen.filter, pageOf(screen.list), h),
      notice(screen.status, h),
      role === "viewer"
        ? h.p(
            [h.Class(className(styles.secondaryNote)), h.Role("note")],
            ["Read-only. Only an owner can cancel or restore a repeat payment."]
          )
        : h.p(
            [h.Class(className(styles.secondaryNote)), h.Role("note")],
            [
              "Restore puts back the notice a repeat payment held before you cancelled it here, so a repeat payment that was already cancelled offers none.",
            ]
          ),
      rows(screen.list, role, screen.prior, screen.status, screen.filter, h),
    ]
  );

export interface SubscriptionsInputs {
  readonly role: SubscriptionRoleValue;
}

export const view = Submodel.defineView<
  SubscriptionsScreenValue,
  SubscriptionsMessageValue,
  SubscriptionsInputs
>((screen, viewInputs, h) =>
  h.section(
    [h.AriaLabel("Subscriptions"), h.Class(className(styles.section))],
    [
      h.h1([h.Class(className(styles.pageTitle))], ["Subscriptions"]),
      browsing(screen, viewInputs.role, h),
    ]
  )
);
