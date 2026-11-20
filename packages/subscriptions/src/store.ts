import { Context, Schema } from "effect";
import type { Effect, Option } from "effect";

import type { IllegalStatusChange } from "./illegal-status-change.js";
import {
  ConfidenceSchema,
  CountSchema,
  DateOnlySchema,
  FrequencySchema,
  PayeeIdSchema,
  PaymentSchema,
  StatusSchema,
} from "./model.js";
import type {
  CategoryId,
  Charge,
  CurrencyCode,
  Payee,
  ProfileId,
  SubscriptionCategoryChange,
  SubscriptionEntry,
  SubscriptionId,
  StatusChange,
  TimestampMillis,
} from "./model.js";
import type { SubscriptionStoreError } from "./subscription-store-error.js";

export const RepeatMarkSchema = Schema.Struct({
  amount: PaymentSchema,
  baseAmount: PaymentSchema,
  confidence: ConfidenceSchema,
  frequency: FrequencySchema,
  lastChargedOn: DateOnlySchema,
  nextExpectedOn: DateOnlySchema,
  occurrenceCount: CountSchema,
  payeeId: PayeeIdSchema,
  status: StatusSchema,
});

export type RepeatMark = typeof RepeatMarkSchema.Type;

export class SubscriptionStore extends Context.Service<
  SubscriptionStore,
  {
    readonly baseCurrency: (
      profileId: ProfileId
    ) => Effect.Effect<CurrencyCode, SubscriptionStoreError>;
    readonly categorise: (
      profileId: ProfileId,
      subscriptionId: SubscriptionId,
      change: SubscriptionCategoryChange
    ) => Effect.Effect<
      Option.Option<SubscriptionEntry>,
      SubscriptionStoreError
    >;
    readonly categories: (
      profileId: ProfileId
    ) => Effect.Effect<readonly CategoryId[], SubscriptionStoreError>;
    readonly charges: (
      profileId: ProfileId
    ) => Effect.Effect<readonly Charge[], SubscriptionStoreError>;
    readonly entries: (
      profileId: ProfileId
    ) => Effect.Effect<readonly SubscriptionEntry[], SubscriptionStoreError>;
    readonly mark: (
      profileId: ProfileId,
      mark: RepeatMark
    ) => Effect.Effect<SubscriptionEntry, SubscriptionStoreError>;
    readonly patchStatus: (
      profileId: ProfileId,
      subscriptionId: SubscriptionId,
      change: StatusChange,
      at: TimestampMillis
    ) => Effect.Effect<
      Option.Option<SubscriptionEntry>,
      SubscriptionStoreError | IllegalStatusChange
    >;
    readonly payees: (
      profileId: ProfileId
    ) => Effect.Effect<readonly Payee[], SubscriptionStoreError>;
  }
>()("@pecunia/subscriptions/SubscriptionStore") {}
