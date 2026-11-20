import type {
  StatusChange,
  SubscriptionFilter,
  SubscriptionId,
  SubscriptionView,
} from "@pecunia/subscriptions";
import { Option } from "effect";
import type { Update } from "foldkit";

import { ChangeStatus, LoadSubscriptions } from "./command.js";
import type { SubscriptionsGateway } from "./gateway.js";
import { Message } from "./message.js";
import type { SubscriptionsMessageValue } from "./message.js";
import {
  canCancel,
  canRestore,
  cancelChange,
  doneNoticeOf,
  remembering,
  rememberingAll,
  restoreChangeOf,
  rowIn,
  sameFilter,
  StatusChangeState,
  SubscriptionList,
  SubscriptionsScreen,
} from "./model.js";
import type {
  OfferedChangeValue,
  PriorNoticeValue,
  StatusChangeStateValue,
  SubscriptionListValue,
  SubscriptionRoleValue,
  SubscriptionsScreenValue,
} from "./model.js";

export type SubscriptionsUpdate = Update.Return<
  SubscriptionsScreenValue,
  SubscriptionsMessageValue,
  SubscriptionsGateway
>;

interface BrowsingPatch {
  readonly filter?: SubscriptionFilter;
  readonly generation?: number;
  readonly list?: SubscriptionListValue;
  readonly prior?: readonly PriorNoticeValue[];
  readonly status?: StatusChangeStateValue;
}

const browsingOf = (
  screen: SubscriptionsScreenValue,
  patch: BrowsingPatch
): SubscriptionsScreenValue =>
  SubscriptionsScreen.Browsing({
    filter: patch.filter ?? screen.filter,
    generation: patch.generation ?? screen.generation,
    list: patch.list ?? screen.list,
    prior: patch.prior ?? screen.prior,
    status: patch.status ?? screen.status,
  });

const reloading = (
  screen: SubscriptionsScreenValue,
  filter: SubscriptionFilter
): SubscriptionsUpdate => ({
  commands: [LoadSubscriptions({ filter, generation: screen.generation + 1 })],
  model: browsingOf(screen, {
    filter,
    generation: screen.generation + 1,
    list: SubscriptionList.Loading(),
    status: StatusChangeState.Idle(),
  }),
});

export const open = (screen: SubscriptionsScreenValue): SubscriptionsUpdate =>
  SubscriptionList.guards.Ready(screen.list)
    ? { model: screen }
    : reloading(screen, screen.filter);

const sending = (
  screen: SubscriptionsScreenValue,
  view: SubscriptionView,
  change: StatusChange,
  mode: OfferedChangeValue
): SubscriptionsUpdate => ({
  commands: [ChangeStatus({ change, subscriptionId: view.id })],
  model: browsingOf(screen, {
    status: StatusChangeState.Sending({
      mode,
      payeeName: view.payeeName,
      subscriptionId: view.id,
    }),
  }),
});

const requestedCancel = (
  role: SubscriptionRoleValue,
  subscriptionId: SubscriptionId,
  screen: SubscriptionsScreenValue
): SubscriptionsUpdate => {
  if (StatusChangeState.guards.Sending(screen.status)) {
    return { model: screen };
  }

  return Option.match(rowIn(screen.list, subscriptionId), {
    onNone: () => ({ model: screen }),
    onSome: (view) =>
      canCancel(role, view)
        ? sending(screen, view, cancelChange(), "Cancel")
        : { model: screen },
  });
};

const requestedRestore = (
  role: SubscriptionRoleValue,
  subscriptionId: SubscriptionId,
  screen: SubscriptionsScreenValue
): SubscriptionsUpdate => {
  if (StatusChangeState.guards.Sending(screen.status)) {
    return { model: screen };
  }

  return Option.match(rowIn(screen.list, subscriptionId), {
    onNone: () => ({ model: screen }),
    onSome: (view) =>
      canRestore(role, screen.prior, view)
        ? Option.match(restoreChangeOf(screen.prior, view), {
            onNone: () => ({ model: screen }),
            onSome: (change) => sending(screen, view, change, "Restore"),
          })
        : { model: screen },
  });
};

const completedStatus = (
  view: SubscriptionView,
  screen: SubscriptionsScreenValue
): SubscriptionsUpdate =>
  StatusChangeState.match<SubscriptionsUpdate>(screen.status, {
    Done: () => ({ model: screen }),
    Failed: () => ({ model: screen }),
    Idle: () => ({ model: screen }),
    Sending: ({ subscriptionId }) =>
      subscriptionId === view.id
        ? {
            commands: [
              LoadSubscriptions({
                filter: screen.filter,
                generation: screen.generation + 1,
              }),
            ],
            model: browsingOf(screen, {
              generation: screen.generation + 1,
              list: SubscriptionList.Loading(),
              prior: remembering(screen.prior, view),
              status: StatusChangeState.Done({
                notice: doneNoticeOf(view),
              }),
            }),
          }
        : { model: screen },
  });

const failedStatus = (
  reason: string,
  subscriptionId: SubscriptionId,
  screen: SubscriptionsScreenValue
): SubscriptionsUpdate =>
  StatusChangeState.match<SubscriptionsUpdate>(screen.status, {
    Done: () => ({ model: screen }),
    Failed: () => ({ model: screen }),
    Idle: () => ({ model: screen }),
    Sending: ({ subscriptionId: sent }) =>
      sent === subscriptionId
        ? {
            model: browsingOf(screen, {
              status: StatusChangeState.Failed({ reason }),
            }),
          }
        : { model: screen },
  });

export const update = (
  screen: SubscriptionsScreenValue,
  role: SubscriptionRoleValue,
  message: SubscriptionsMessageValue
): SubscriptionsUpdate =>
  Message.match<SubscriptionsUpdate>(message, {
    ChoseFilter: ({ filter }) =>
      sameFilter(filter, screen.filter)
        ? { model: screen }
        : reloading(screen, filter),
    CompletedLoad: ({ generation, page }) =>
      generation === screen.generation
        ? {
            model: browsingOf(screen, {
              list: SubscriptionList.Ready({ page }),
              prior: rememberingAll(screen.prior, page.subscriptions),
            }),
          }
        : { model: screen },
    CompletedStatus: ({ view }) => completedStatus(view, screen),
    FailedLoad: ({ generation, reason }) =>
      generation === screen.generation
        ? {
            model: browsingOf(screen, {
              list: SubscriptionList.Failed({ reason }),
            }),
          }
        : { model: screen },
    FailedStatus: ({ reason, subscriptionId }) =>
      failedStatus(reason, subscriptionId, screen),
    RequestedCancel: ({ subscriptionId }) =>
      requestedCancel(role, subscriptionId, screen),
    RequestedRestore: ({ subscriptionId }) =>
      requestedRestore(role, subscriptionId, screen),
    Retried: () => reloading(screen, screen.filter),
  });
