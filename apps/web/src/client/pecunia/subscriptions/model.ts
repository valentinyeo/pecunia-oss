import {
  isActiveStatus,
  RestorableTagSchema,
  StatusChangeSchema,
  SubscriptionFilterSchema,
  SubscriptionIdSchema,
  SubscriptionPageSchema,
} from "@pecunia/subscriptions";
import type {
  Frequency,
  Money,
  RestorableTag,
  Status,
  StatusChange,
  SubscriptionFilter,
  SubscriptionId,
  SubscriptionPage,
  SubscriptionView,
} from "@pecunia/subscriptions";
import { Match, Option, Predicate, Schema } from "effect";
import { defineTaggedUnion } from "foldkit/schema";

export const Generation = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const SubscriptionRole = Schema.Literals(["owner", "viewer"]);

export type SubscriptionRoleValue = typeof SubscriptionRole.Type;

export const SubscriptionList = defineTaggedUnion({
  Failed: { reason: Schema.NonEmptyString },
  Loading: {},
  Ready: { page: SubscriptionPageSchema },
});

export type SubscriptionListValue = typeof SubscriptionList.Type;

export const PriorNotice = Schema.Struct({
  id: SubscriptionIdSchema,
  tag: RestorableTagSchema,
});

export type PriorNoticeValue = typeof PriorNotice.Type;

export const OfferedChange = Schema.Literals(["Cancel", "Restore"]);

export type OfferedChangeValue = typeof OfferedChange.Type;

export const StatusChangeState = defineTaggedUnion({
  Done: { notice: Schema.NonEmptyString },
  Failed: { reason: Schema.NonEmptyString },
  Idle: {},
  Sending: {
    mode: OfferedChange,
    payeeName: Schema.NonEmptyString,
    subscriptionId: SubscriptionIdSchema,
  },
});

export type StatusChangeStateValue = typeof StatusChangeState.Type;

export const SubscriptionsScreen = defineTaggedUnion({
  Browsing: {
    filter: SubscriptionFilterSchema,
    generation: Generation,
    list: SubscriptionList,
    prior: Schema.Array(PriorNotice),
    status: StatusChangeState,
  },
});

export type SubscriptionsScreenValue = typeof SubscriptionsScreen.Type;

export const allFilter: SubscriptionFilter =
  SubscriptionFilterSchema.cases.All.make({});

export const activeFilter: SubscriptionFilter =
  SubscriptionFilterSchema.cases.Active.make({});

export const initialSubscriptions: SubscriptionsScreenValue =
  SubscriptionsScreen.Browsing({
    filter: allFilter,
    generation: 1,
    list: SubscriptionList.Loading(),
    prior: [],
    status: StatusChangeState.Idle(),
  });

export const filterOptions: readonly Readonly<{
  filter: SubscriptionFilter;
  label: string;
}>[] = [
  { filter: allFilter, label: "All" },
  { filter: activeFilter, label: "Active" },
];

export const sameFilter = (
  left: SubscriptionFilter,
  right: SubscriptionFilter
): boolean => left._tag === right._tag;

export const ownerRole = (role: SubscriptionRoleValue): boolean =>
  role === "owner";

export const frequencyLabel = (frequency: Frequency): string =>
  Match.value(frequency).pipe(
    Match.when("annual", () => "Yearly"),
    Match.when("monthly", () => "Monthly"),
    Match.when("quarterly", () => "Quarterly"),
    Match.when("weekly", () => "Weekly"),
    Match.exhaustive
  );

export const statusLabel = (status: Status): string =>
  Match.value(status._tag).pipe(
    Match.when("Cancelled", () => "Cancelled"),
    Match.when("Confirmed", () => "Confirmed"),
    Match.when("Detected", () => "Detected"),
    Match.when("Dismissed", () => "Dismissed"),
    Match.when("NotRecurring", () => "Not a repeat payment"),
    Match.exhaustive
  );

export const rowsOf = (
  list: SubscriptionListValue
): readonly SubscriptionView[] =>
  SubscriptionList.match<readonly SubscriptionView[]>(list, {
    Failed: () => [],
    Loading: () => [],
    Ready: ({ page }) => page.subscriptions,
  });

export const totalsOf = (
  list: SubscriptionListValue
): Option.Option<Readonly<{ annual: Money; monthly: Money }>> =>
  SubscriptionList.match<
    Option.Option<Readonly<{ annual: Money; monthly: Money }>>
  >(list, {
    Failed: () => Option.none(),
    Loading: () => Option.none(),
    Ready: ({ page }) =>
      Option.some({ annual: page.activeAnnual, monthly: page.activeMonthly }),
  });

export const pageOf = (
  list: SubscriptionListValue
): Option.Option<SubscriptionPage> =>
  SubscriptionList.match<Option.Option<SubscriptionPage>>(list, {
    Failed: () => Option.none(),
    Loading: () => Option.none(),
    Ready: ({ page }) => Option.some(page),
  });

export const rowIn = (
  list: SubscriptionListValue,
  subscriptionId: SubscriptionId
): Option.Option<SubscriptionView> =>
  Option.fromUndefinedOr(rowsOf(list).find((row) => row.id === subscriptionId));

export const priorTagOf = (
  prior: readonly PriorNoticeValue[],
  subscriptionId: SubscriptionId
): Option.Option<RestorableTag> =>
  Option.map(
    Option.fromUndefinedOr(
      prior.find((notice) => notice.id === subscriptionId)
    ),
    (notice) => notice.tag
  );

export const remembering = (
  prior: readonly PriorNoticeValue[],
  view: SubscriptionView
): readonly PriorNoticeValue[] =>
  Predicate.isTagged(view.status, "Cancelled")
    ? prior
    : [
        ...prior.filter((notice) => notice.id !== view.id),
        { id: view.id, tag: view.status._tag },
      ];

export const rememberingAll = (
  prior: readonly PriorNoticeValue[],
  views: readonly SubscriptionView[]
): readonly PriorNoticeValue[] => {
  let remembered = prior;

  for (const view of views) {
    remembered = remembering(remembered, view);
  }

  return remembered;
};

export const nextChargeShown = (
  view: SubscriptionView
): Option.Option<string> => view.nextCharge;

export const canCancel = (
  role: SubscriptionRoleValue,
  view: SubscriptionView
): boolean => ownerRole(role) && isActiveStatus(view.status);

export const cancelChange = (): StatusChange =>
  StatusChangeSchema.cases.Cancel.make({});

export const restoreChangeOf = (
  prior: readonly PriorNoticeValue[],
  view: SubscriptionView
): Option.Option<StatusChange> =>
  Predicate.isTagged(view.status, "Cancelled")
    ? Option.map(priorTagOf(prior, view.id), (tag) =>
        StatusChangeSchema.cases.Restore.make({ to: tag })
      )
    : Option.none();

export const canRestore = (
  role: SubscriptionRoleValue,
  prior: readonly PriorNoticeValue[],
  view: SubscriptionView
): boolean => ownerRole(role) && Option.isSome(restoreChangeOf(prior, view));

export const statusChangeNotice = (status: StatusChangeStateValue): string =>
  StatusChangeState.match<string>(status, {
    Done: ({ notice }) => notice,
    Failed: ({ reason }) => reason,
    Idle: () => "",
    Sending: ({ mode, payeeName }) =>
      mode === "Cancel"
        ? `Cancelling ${payeeName}…`
        : `Restoring ${payeeName}…`,
  });

export const doneNoticeOf = (view: SubscriptionView): string =>
  Predicate.isTagged(view.status, "Cancelled")
    ? `Cancelled ${view.payeeName}. Nothing is cancelled at the merchant, and no money moves.`
    : `Restored ${view.payeeName} to ${statusLabel(view.status)}.`;

export const emptyCopy = (filter: SubscriptionFilter): string =>
  Predicate.isTagged(filter, "Active")
    ? "No repeat payment counts towards your spend."
    : "No repeat payments yet. Mark one from a payee in your payment history.";
