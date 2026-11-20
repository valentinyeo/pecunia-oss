import { Match, Option } from "effect";

import type {
  Charge,
  Subscription,
  SubscriptionCategoryChange,
} from "./model.js";

export const applyCategoryChange = (
  subscription: Subscription,
  change: SubscriptionCategoryChange
): Subscription =>
  Match.value(change).pipe(
    Match.tag("Assign", ({ categoryId }) => ({
      ...subscription,
      categoryId: Option.some(categoryId),
    })),
    Match.tag("Clear", () => ({ ...subscription, categoryId: Option.none() })),
    Match.exhaustive
  );

export const applyCategoryChangeToCharge = (
  charge: Charge,
  change: SubscriptionCategoryChange
): Charge =>
  Match.value(change).pipe(
    Match.tag("Assign", ({ categoryId }) => ({
      ...charge,
      categoryId: Option.some(categoryId),
    })),
    Match.tag("Clear", () => ({ ...charge, categoryId: Option.none() })),
    Match.exhaustive
  );
