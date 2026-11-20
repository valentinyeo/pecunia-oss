import { Match, Predicate, Result } from "effect";

import { IllegalStatusChange } from "./illegal-status-change.js";
import { StatusSchema } from "./model.js";
import type {
  Status,
  StatusChange,
  StatusTag,
  Subscription,
  TimestampMillis,
} from "./model.js";

export const statusWith = (tag: StatusTag, at: TimestampMillis): Status =>
  Match.value(tag).pipe(
    Match.when("Cancelled", () => StatusSchema.cases.Cancelled.make({ at })),
    Match.when("Confirmed", () => StatusSchema.cases.Confirmed.make({ at })),
    Match.when("Detected", () => StatusSchema.cases.Detected.make({ at })),
    Match.when("Dismissed", () => StatusSchema.cases.Dismissed.make({ at })),
    Match.when("NotRecurring", () =>
      StatusSchema.cases.NotRecurring.make({ at })
    ),
    Match.exhaustive
  );

export const targetTagOf = (change: StatusChange): StatusTag =>
  Match.value(change).pipe(
    Match.tag("Cancel", () => "Cancelled" as const),
    Match.tag("Confirm", () => "Confirmed" as const),
    Match.tag("Dismiss", () => "Dismissed" as const),
    Match.tag("MarkNotRecurring", () => "NotRecurring" as const),
    Match.tag("MarkRecurring", () => "Confirmed" as const),
    Match.tag("Restore", ({ to }) => to),
    Match.exhaustive
  );

export const isActiveStatus = (status: Status): boolean =>
  Predicate.isTagged(status, "Confirmed") ||
  Predicate.isTagged(status, "Detected");

const withStatusOf = (
  subscription: Subscription,
  tag: StatusTag,
  at: TimestampMillis
): Subscription =>
  subscription.status._tag === tag
    ? subscription
    : { ...subscription, status: statusWith(tag, at) };

export const confirmSubscription = (
  subscription: Subscription,
  at: TimestampMillis
): Subscription => withStatusOf(subscription, "Confirmed", at);

export const applyStatusChange = (
  subscription: Subscription,
  change: StatusChange,
  at: TimestampMillis
): Result.Result<Subscription, IllegalStatusChange> => {
  const restoring = Predicate.isTagged(change, "Restore");
  const cancelled = Predicate.isTagged(subscription.status, "Cancelled");

  if (restoring && !cancelled) {
    return Result.fail(
      new IllegalStatusChange({
        change,
        current: subscription.status._tag,
        message: `Repeat payment ${subscription.id} is ${subscription.status._tag}, so there is no cancellation to undo.`,
        repair:
          "Call `changeSubscriptionStatus` with a `Restore` only for a cancelled repeat payment, or send the change that matches its current status.",
        subscriptionId: subscription.id,
      })
    );
  }

  return Result.succeed(withStatusOf(subscription, targetTagOf(change), at));
};
