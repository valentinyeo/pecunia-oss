import { pageOf } from "@pecunia/subscriptions";
import type {
  SubscriptionEntry,
  SubscriptionFilter,
  SubscriptionId,
  SubscriptionPage,
  SubscriptionView,
} from "@pecunia/subscriptions";
import {
  demoProfileId,
  demoSubscriptionSeed,
} from "@pecunia/subscriptions/demo";
import { Predicate, Result } from "effect";

const missing = (what: string): never => {
  throw new Error(`The demo book has ${what}.`);
};

const demoProfile =
  demoSubscriptionSeed.profiles.find(
    (profile) => profile.id === demoProfileId
  ) ?? missing("no base currency for the demo profile");

const { baseCurrency } = demoProfile;

const entryOf = (
  subscription: (typeof demoSubscriptionSeed.subscriptions)[number]
): SubscriptionEntry => {
  const payee = demoSubscriptionSeed.payees.find(
    (candidate) =>
      candidate.id === subscription.payeeId &&
      candidate.profileId === subscription.profileId
  );

  if (payee === undefined) {
    return missing(`no payee row for ${subscription.payeeId}`);
  }

  return { payeeName: payee.name, subscription };
};

export const demoEntries: readonly SubscriptionEntry[] =
  demoSubscriptionSeed.subscriptions.map(entryOf);

const cancelledStatus = (
  demoSubscriptionSeed.subscriptions.find((subscription) =>
    Predicate.isTagged(subscription.status, "Cancelled")
  ) ?? missing("no cancelled repeat payment")
).status;

const cancelledEntries: readonly SubscriptionEntry[] = demoEntries.map(
  (entry) =>
    Predicate.isTagged(entry.subscription.status, "Confirmed")
      ? {
          ...entry,
          subscription: { ...entry.subscription, status: cancelledStatus },
        }
      : entry
);

const pageFor = (
  entries: readonly SubscriptionEntry[],
  filter: SubscriptionFilter
): SubscriptionPage => Result.getOrThrow(pageOf(entries, filter, baseCurrency));

export const demoPage = (filter: SubscriptionFilter): SubscriptionPage =>
  pageFor(demoEntries, filter);

export const cancelledDemoPage = (
  filter: SubscriptionFilter
): SubscriptionPage => pageFor(cancelledEntries, filter);

const rowNamed = (
  page: SubscriptionPage,
  payeeName: string
): SubscriptionView => {
  const found = page.subscriptions.find((row) => row.payeeName === payeeName);

  if (found === undefined) {
    throw new Error(`The demo page has no repeat payment for ${payeeName}.`);
  }

  return found;
};

export const demoRow = (
  filter: SubscriptionFilter,
  payeeName: string
): SubscriptionView => rowNamed(demoPage(filter), payeeName);

export const cancelledDemoRow = (
  filter: SubscriptionFilter,
  payeeName: string
): SubscriptionView => rowNamed(cancelledDemoPage(filter), payeeName);

export const idOf = (view: SubscriptionView): SubscriptionId => view.id;

export const rowFor = (
  page: SubscriptionPage,
  subscriptionId: SubscriptionId
): SubscriptionView | undefined =>
  page.subscriptions.find((row) => row.id === subscriptionId);
